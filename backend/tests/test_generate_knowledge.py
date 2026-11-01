"""Knowledge generator helpers: pagination and championship counting."""

from unittest.mock import MagicMock

from app.ingestion.generate_knowledge import _count_titles, _fetch_all


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
