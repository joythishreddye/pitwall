"""Knowledge generator helpers: pagination, championship counting, and how
results that aren't finishes read."""

from unittest.mock import MagicMock

from app.ingestion import generate_knowledge as gk
from app.ingestion.generate_knowledge import _count_titles, _fetch_all
from app.rag.chunker import chunk_markdown


def _builder(pages: list[list[dict]]) -> tuple[MagicMock, list[tuple[int, int]]]:
    """A fake query builder that serves ``pages`` and records requested ranges."""
    ranges: list[tuple[int, int]] = []
    served = iter(pages)

    def build() -> MagicMock:
        query = MagicMock()

        def range_(start: int, end: int) -> MagicMock:
            ranges.append((start, end))
            return MagicMock(
                execute=MagicMock(return_value=MagicMock(data=next(served)))
            )

        query.range.side_effect = range_
        return query

    return build, ranges


def test_fetch_all_reads_past_the_row_cap() -> None:
    build, ranges = _builder([[{"id": i} for i in range(3)]] * 2 + [[{"id": 99}]])

    rows = _fetch_all(build, page_size=3)

    assert len(rows) == 7
    assert ranges == [(0, 2), (3, 5), (6, 8)]


def test_fetch_all_stops_on_an_empty_page() -> None:
    build, ranges = _builder([[{"id": 1}, {"id": 2}], []])

    assert _fetch_all(build, page_size=2) == [{"id": 1}, {"id": 2}]
    assert ranges == [(0, 1), (2, 3)]


def test_titles_skip_the_season_in_progress() -> None:
    leaders = [
        {"entity_id": 1, "season": 2024, "round": 24},
        {"entity_id": 1, "season": 2025, "round": 24},
        {"entity_id": 7, "season": 2026, "round": 19},
    ]

    titles = _count_titles(leaders, lambda season: season < 2026)

    assert titles == {1: 2}


def test_titles_use_the_final_round_leader() -> None:
    leaders = [
        {"entity_id": 3, "season": 2021, "round": 10},
        {"entity_id": 1, "season": 2021, "round": 22},
    ]

    assert _count_titles(leaders, lambda season: True) == {1: 1}


def test_format_time_handles_laps_and_full_races() -> None:
    from app.ingestion.generate_knowledge import _format_time

    assert _format_time(83_456) == "1:23.456"  # a lap
    assert _format_time(6_434_808) == "1:47:14.808"  # a race
    assert _format_time(None) == "N/A"


def test_metadata_ref_lists_keep_podium_order() -> None:
    from app.ingestion.generate_knowledge import _unique_in_order

    assert _unique_in_order(["mercedes", "ferrari", "mercedes"]) == [
        "mercedes",
        "ferrari",
    ]


# --- #39: non-starters, disqualifications, position codes, sprint points ---


def _row(
    name: str, status: str, grid: int, position_text: str = "R", laps: int = 10
) -> dict:
    forename, surname = name.split(" ", 1)
    return {
        "drivers": {"forename": forename, "surname": surname},
        "status": status,
        "grid": grid,
        "position_text": position_text,
        "laps": laps,
    }


def test_a_driver_who_did_not_start_or_was_disqualified_is_no_dnf() -> None:
    for row in (
        _row("A B", "Did not start", 5, "W", laps=0),
        _row("A B", "Withdrew", 0, "W", laps=0),
        # A mechanical status with no lap and Jolpica's W is a non-start too
        _row("A B", "Power Unit", 12, "W", laps=0),
        _row("A B", "Disqualified", 6, "D"),
        _row("A B", "Excluded", 6, "E"),
        _row("A B", "Finished", 1, "1"),
        _row("A B", "+1 Lap", 14, "14"),
    ):
        assert not gk._is_dnf(row), row["status"]
    for row in (
        _row("A B", "Engine", 3),
        _row("A B", "Collision", 8, laps=0),  # out on the first lap: started
        # Jolpica marks some mid-race retirements "Withdrew" (Mexico 2019)
        _row("A B", "Withdrew", 4, "W", laps=47),
        _row("A B", "Withdrew", 9, "17", laps=60),
    ):
        assert gk._is_dnf(row), row["status"]


def test_position_codes_read_as_words_not_as_places() -> None:
    assert gk._finish_text("3", 3) == "P3"
    assert gk._finish_text("R", 17) == "retired"
    assert gk._finish_text("W", 20) == "withdrew"
    assert gk._finish_text("D", 8) == "disqualified"
    assert gk._finish_text(None, 5) == "P5"


def test_grid_zero_is_a_pit_lane_start() -> None:
    assert gk._start_text(0) == "started from the pit lane"
    assert gk._start_text(7) == "started P7"


def test_a_recent_result_never_says_a_non_starter_started() -> None:
    race = {"round": 20, "name": "Brazilian Grand Prix"}
    dns = {**_row("Valtteri Bottas", "Did not start", 17, "W", laps=0), "races": race}
    quit_ = {**_row("Lando Norris", "Withdrew", 4, "W", laps=47), "races": race}
    out = {**_row("Fernando Alonso", "Gearbox", 0, "R"), "races": race}
    fin = {**_row("Lando Norris", "Finished", 1, "1"), "races": race}

    assert gk._recent_line(dns) == "- Round 20 Brazilian Grand Prix: did not start"
    assert gk._recent_line(quit_) == (
        "- Round 20 Brazilian Grand Prix: withdrew (started P4)"
    )
    assert gk._recent_line(out) == (
        "- Round 20 Brazilian Grand Prix: retired (started from the pit lane)"
    )
    assert gk._recent_line(fin) == "- Round 20 Brazilian Grand Prix: P1 (started P1)"


def test_race_docs_list_retirements_non_starters_and_disqualifications_apart() -> None:
    md = gk._non_finisher_sections(
        [
            _row("Lando Norris", "Finished", 1, "1"),
            _row("Brendon Hartley", "Power Unit", 0),
            _row("Carlos Sainz", "Did not start", 12, "W", laps=0),
            _row("Lance Stroll", "Withdrew", 0, "W", laps=0),
            _row("Kevin Magnussen", "Withdrew", 15, "W", laps=12),
            _row("Esteban Ocon", "Disqualified", 6, "D"),
        ],
        "Turkish Grand Prix 2020",
    )

    # One ## section, so the chunker keeps the lists together (#39)
    assert md.count("\n## ") == 1
    assert (
        "### Retirements/DNFs\n\n"
        "- Brendon Hartley: Power Unit (started from the pit lane)" in md
    )
    assert "- Kevin Magnussen: Withdrew (started P15)" in md.split("### Did not")[0]
    assert "### Did not start\n\n- Carlos Sainz\n- Lance Stroll\n" in md
    assert "### Disqualified\n\n- Esteban Ocon: Disqualified (started P6)" in md
    assert "Turkish Grand Prix 2020" in md
    assert "Norris" not in md
    assert "P0" not in md
    assert "Sainz: Did not start" not in md


def test_race_docs_leave_out_empty_sections() -> None:
    md = gk._non_finisher_sections(
        [_row("Lando Norris", "Finished", 1, "1")], "Italian Grand Prix 2021"
    )
    assert md == ""


def test_a_lone_non_finisher_still_reaches_the_chat_index(tmp_path) -> None:
    # The chunker splits on ## and drops a chunk under 20 words, so a section
    # holding one short name used to vanish from the index
    races = tmp_path / "races"
    races.mkdir()
    for row in (
        _row("Yuki Tsunoda", "Did not start", 11, "W", laps=0),
        _row("Fernando Alonso", "Retired", 13),
        _row("Lewis Hamilton", "Disqualified", 5, "D"),
    ):
        doc = races / "2021-r14-monza.md"
        doc.write_text(
            "---\ncategory: race\n---\n\n# Italian Grand Prix 2021\n"
            + gk._non_finisher_sections([row], "Italian Grand Prix 2021"),
            encoding="utf-8",
        )
        surname = row["drivers"]["surname"]
        chunks = chunk_markdown(doc)
        assert any(surname in c["content"] for c in chunks), row["status"]


def test_a_team_breakdown_says_why_its_points_skip_sprints() -> None:
    teams = {1: {10}, 2: {10, 11}}
    points = {1: 267.0, 2: 40.0}
    assert gk._breakdown_note(1, teams, points) == ""
    assert gk._breakdown_note(2, teams, points) == (
        " (Grand Prix points only: also drove for another team)"
    )
    # A driver whose results are in but whose standings aren't yet
    assert gk._breakdown_note(3, {3: {10}}, points) == (
        " (Grand Prix points only: not in the standings yet)"
    )


def test_season_totals_come_from_each_seasons_last_standings_round() -> None:
    # Standings include sprint points, which race results don't
    rows = [
        {"entity_id": 1, "season": 2024, "round": 24, "points": 400.0},
        {"entity_id": 1, "season": 2025, "round": 3, "points": 50.0},
        {"entity_id": 1, "season": 2025, "round": 24, "points": 300.5},
        {"entity_id": 2, "season": 2025, "round": 24, "points": None},
    ]
    assert gk._final_points(rows) == {1: 700.5, 2: 0.0}
