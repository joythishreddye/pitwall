"""A Jolpica refresh that leaves qualifying or standings behind fails loudly."""

import importlib.util
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.ingestion import jolpica_ingest
from app.ingestion.jolpica_ingest import (
    IngestReport,
    ingest_qualifying,
    ingest_results,
    ingest_standings,
    run_jolpica_ingest,
)
from tests.test_standings_every_round import (
    ANT,
    RUS,
    _after_round_2s_sprint,
    _db,
    _jolpica,
)

DOWN = RuntimeError("Jolpica is down")


def _standings(db: MagicMock, http: MagicMock, season: int, report: IngestReport):
    return ingest_standings(
        db,
        http,
        MagicMock(),
        [season],
        {"antonelli": ANT, "russell": RUS},
        {"mercedes": 7},
        every_round=True,
        report=report,
    )


def test_qualifying_that_cant_be_fetched_is_a_problem() -> None:
    http = MagicMock()
    http.get.side_effect = DOWN
    report = IngestReport()

    ingest_qualifying(_db({}), http, MagicMock(), [2026], {}, {}, {}, report)

    assert report.problems == ["No qualifying data for 2026: Jolpica is down"]


def test_a_standings_round_that_fails_is_a_problem_and_the_later_ones_are_stored() -> (
    None
):
    http, _ = _jolpica(latest=3)
    serve = http.get.side_effect

    def round_1_down(url: str, params: object = None) -> MagicMock:
        if "/2026/1/" in url:
            raise DOWN
        return serve(url, params)

    http.get.side_effect = round_1_down
    db = _db({"standings": []})
    report = IngestReport()

    _standings(db, http, 2026, report)

    assert report.problems == [
        "driver standings for 2026 round 1 failed: Jolpica is down",
        "constructor standings for 2026 round 1 failed: Jolpica is down",
    ]
    assert report.caught_up == {
        (2026, "driver standings"): 3,
        (2026, "constructor standings"): 3,
    }
    stored = db.table("standings").execute().data
    assert {(r["round"], r["type"]) for r in stored} == {
        (2, "driver"),
        (2, "constructor"),
        (3, "driver"),
        (3, "constructor"),
    }


@pytest.mark.parametrize(
    "short", ["qualifying", "driver standings", "constructor standings"]
)
def test_qualifying_or_standings_short_of_the_results_round_is_a_problem(
    short: str,
) -> None:
    # Jolpica has round 22's results but one of the others still stops at 21;
    # standings ahead of the results (after a sprint) are fine
    caught_up = {
        (2026, "qualifying"): 22,
        (2026, "driver standings"): 23,
        (2026, "constructor standings"): 23,
    }
    caught_up[(2026, short)] = 21
    report = IngestReport(results_round={2026: 22}, caught_up=caught_up)

    report.check_caught_up()

    assert report.problems == [f"{short} for 2026 reach round 21, the results round 22"]


def _qualifying(rnd: int) -> dict:
    return {
        "season": "2026",
        "round": str(rnd),
        "QualifyingResults": [
            {
                "Driver": {"driverId": "antonelli"},
                "Constructor": {"constructorId": "mercedes"},
                "position": "1",
                "Q3": "1:23.456",
            }
        ],
    }


def test_stored_qualifying_records_its_latest_round() -> None:
    # Round 22's qualifying isn't stored (its race isn't in the races table yet)
    page = MagicMock(status_code=200)
    page.json.return_value = {
        "MRData": {
            "total": "3",
            "RaceTable": {"Races": [_qualifying(20), _qualifying(21), _qualifying(22)]},
        }
    }
    http = MagicMock()
    http.get.return_value = page
    report = IngestReport()

    ingest_qualifying(
        _db({"qualifying_results": []}),
        http,
        MagicMock(),
        [2026],
        {(2026, 20): 120, (2026, 21): 121},
        {"antonelli": ANT},
        {"mercedes": 7},
        report,
    )

    assert report.caught_up == {(2026, "qualifying"): 21}
    assert report.problems == []


def test_a_season_with_no_results_yet_needs_no_standings() -> None:
    # The default refresh runs every season to this year: in January the new
    # season has no results and Jolpica lists no standings for it
    empty = MagicMock(status_code=200)
    empty.json.return_value = {
        "MRData": {"StandingsTable": {"season": "2027", "StandingsLists": []}}
    }
    http = MagicMock()
    http.get.return_value = empty
    report = IngestReport(
        results_round={2026: 23},
        caught_up={
            (2026, "qualifying"): 23,
            (2026, "driver standings"): 23,
            (2026, "constructor standings"): 23,
        },
    )

    _standings(_db({"standings": []}), http, 2027, report)
    report.check_caught_up()

    assert report.problems == []


def test_standings_still_short_of_the_latest_grand_prix_arent_caught_up() -> None:
    # Round 2's results are in, but Jolpica's standings still stop at its sprint
    report = IngestReport(
        results_round={2026: 2},
        results_rounds={2026: {1, 2}},
        caught_up={(2026, "qualifying"): 2},
    )

    _standings(_db({"standings": []}), _after_round_2s_sprint(), 2026, report)
    report.check_caught_up()

    assert report.caught_up[(2026, "driver standings")] == 1
    assert report.problems == [
        "driver standings for 2026 reach round 1, the results round 2",
        "constructor standings for 2026 reach round 1, the results round 2",
    ]


def _race(rnd: int) -> dict:
    return {
        "season": "2026",
        "round": str(rnd),
        "Results": [
            {
                "Driver": {"driverId": "antonelli"},
                "Constructor": {"constructorId": "mercedes"},
                "position": "1",
                "points": "25",
            }
        ],
    }


def test_the_results_round_counts_only_races_in_the_database() -> None:
    # Round 22 isn't in the races table yet, so its results aren't stored
    page = MagicMock(status_code=200)
    page.json.return_value = {
        "MRData": {"total": "2", "RaceTable": {"Races": [_race(21), _race(22)]}}
    }
    http = MagicMock()
    http.get.return_value = page
    report = IngestReport()

    ingest_results(
        _db({"race_results": []}),
        http,
        MagicMock(),
        [2026],
        {(2026, 21): 121},
        {"antonelli": ANT},
        {"mercedes": 7},
        report,
    )

    assert report.results_round == {2026: 21}
    assert report.results_rounds == {2026: {21}}


def test_the_full_ingest_hands_its_report_on_and_checks_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Results reach round 22 while qualifying and both standings stop at 21
    handed: list[IngestReport] = []

    def results(*args: object) -> int:
        handed.append(args[-1])
        args[-1].results_round[2026] = 22
        return 0

    def qualifying(*args: object) -> int:
        handed.append(args[-1])
        args[-1].caught_up[(2026, "qualifying")] = 21
        return 0

    def standings(*args: object, report: IngestReport, **kwargs: object) -> int:
        handed.append(report)
        for what in ("driver standings", "constructor standings"):
            report.caught_up[(2026, what)] = 21
        return 0

    for name in ("ingest_circuits", "ingest_drivers", "ingest_constructors"):
        monkeypatch.setattr(jolpica_ingest, name, lambda *args: 0)
    monkeypatch.setattr(jolpica_ingest, "ingest_races", lambda *args: 0)
    monkeypatch.setattr(jolpica_ingest, "build_lookup", lambda *args: {})
    monkeypatch.setattr(jolpica_ingest, "build_race_lookup", lambda *args: {})
    monkeypatch.setattr(jolpica_ingest, "ingest_results", results)
    monkeypatch.setattr(jolpica_ingest, "ingest_qualifying", qualifying)
    monkeypatch.setattr(jolpica_ingest, "ingest_standings", standings)
    report = IngestReport()

    run_jolpica_ingest(MagicMock(), [2026], report=report)

    assert len(handed) == 3 and all(given is report for given in handed)
    assert report.problems == [
        f"{what} for 2026 reach round 21, the results round 22"
        for what in ("qualifying", "driver standings", "constructor standings")
    ]


def _seed_database():
    """scripts/seed_database.py, which isn't a package, loaded by path."""
    if "seed_database" in sys.modules:
        return sys.modules["seed_database"]
    path = Path(__file__).resolve().parents[1] / "scripts" / "seed_database.py"
    spec = importlib.util.spec_from_file_location("seed_database", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_database"] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("problems", [[], ["driver standings for 2026 ..."]])
def test_the_refresh_exits_1_when_jolpica_left_anything_behind(
    monkeypatch: pytest.MonkeyPatch, problems: list[str]
) -> None:
    seed = _seed_database()

    def ingest(supabase: object, **kwargs: object) -> dict:
        kwargs["report"].problems.extend(problems)
        return {}

    monkeypatch.setattr(seed, "get_supabase", MagicMock)
    monkeypatch.setattr(seed, "ping_supabase", lambda: None)
    monkeypatch.setattr(seed, "run_jolpica_ingest", ingest)
    monkeypatch.setattr(seed, "validate_counts", lambda _db: True)
    argv = ["seed_database.py", "--seasons", "2026", "--skip-fastf1"]
    monkeypatch.setattr(sys, "argv", argv)

    if problems:
        with pytest.raises(SystemExit) as stopped:
            seed.main()
        assert stopped.value.code == 1
    else:
        assert seed.main() is None
