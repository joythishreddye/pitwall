"""Session start times: Jolpica's schedule to the static file, and back."""

import importlib.util
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

from app.schedule import load_schedule, round_from_jolpica, schedule_from_jolpica

# Two 2026 rounds as Jolpica serves them (its key order kept, Circuit trimmed)
QATAR = {
    "season": "2026",
    "round": "22",
    "raceName": "Qatar Grand Prix",
    "Circuit": {"circuitId": "losail"},
    "date": "2026-11-29",
    "time": "16:00:00Z",
    "FirstPractice": {"date": "2026-11-27", "time": "13:30:00Z"},
    "SecondPractice": {"date": "2026-11-27", "time": "17:00:00Z"},
    "ThirdPractice": {"date": "2026-11-28", "time": "14:30:00Z"},
    "Qualifying": {"date": "2026-11-28", "time": "18:00:00Z"},
}
CHINA = {
    "season": "2026",
    "round": "2",
    "raceName": "Chinese Grand Prix",
    "Circuit": {"circuitId": "shanghai"},
    "date": "2026-03-15",
    "time": "07:00:00Z",
    "FirstPractice": {"date": "2026-03-13", "time": "03:30:00Z"},
    "Qualifying": {"date": "2026-03-14", "time": "07:00:00Z"},
    "Sprint": {"date": "2026-03-14", "time": "03:00:00Z"},
    "SprintQualifying": {"date": "2026-03-13", "time": "07:30:00Z"},
}


def _starts(stored: dict) -> list[tuple[str, str | None]]:
    return [(s["name"], s["start"]) for s in stored["sessions"]]


def test_a_normal_weekend_has_three_practices_qualifying_and_the_race() -> None:
    stored = round_from_jolpica(QATAR)

    assert stored["round"] == 22
    assert stored["circuit_ref"] == "losail"
    assert stored["sprint"] is False
    assert _starts(stored) == [
        ("practice_1", "2026-11-27T13:30:00Z"),
        ("practice_2", "2026-11-27T17:00:00Z"),
        ("practice_3", "2026-11-28T14:30:00Z"),
        ("qualifying", "2026-11-28T18:00:00Z"),
        ("race", "2026-11-29T16:00:00Z"),
    ]


def test_a_sprint_weekend_puts_its_sessions_in_start_order() -> None:
    stored = round_from_jolpica(CHINA)

    assert stored["sprint"] is True
    assert _starts(stored) == [
        ("practice_1", "2026-03-13T03:30:00Z"),
        ("sprint_qualifying", "2026-03-13T07:30:00Z"),
        ("sprint", "2026-03-14T03:00:00Z"),
        ("qualifying", "2026-03-14T07:00:00Z"),
        ("race", "2026-03-15T07:00:00Z"),
    ]


def test_a_session_without_a_time_keeps_its_date_and_has_no_start(
    tmp_path: Path,
) -> None:
    race = {**QATAR, "time": None, "ThirdPractice": {"date": "2026-11-28"}}
    stored = round_from_jolpica(race)

    assert stored["sessions"][2:] == [
        {"name": "qualifying", "date": "2026-11-28", "start": "2026-11-28T18:00:00Z"},
        # A timeless session goes after the timed ones on its day
        {"name": "practice_3", "date": "2026-11-28", "start": None},
        {"name": "race", "date": "2026-11-29", "start": None},
    ]

    (tmp_path / "2026.json").write_text(json.dumps(schedule_from_jolpica(2026, [race])))
    (loaded,) = load_schedule(2026, tmp_path)
    assert loaded.race.start is None
    assert loaded.race.date.isoformat() == "2026-11-29"


def test_the_file_round_trips_into_utc_starts(tmp_path: Path) -> None:
    (tmp_path / "2026.json").write_text(
        json.dumps(schedule_from_jolpica(2026, [QATAR, CHINA]))
    )

    china, qatar = load_schedule(2026, tmp_path)
    assert (china.round, qatar.round) == (2, 22)
    assert qatar.race.start == datetime(2026, 11, 29, 16, 0, tzinfo=UTC)
    assert [s.name for s in china.sessions][:2] == ["practice_1", "sprint_qualifying"]
    assert load_schedule(2027, tmp_path) == []


def test_the_loader_returns_rounds_in_round_order(tmp_path: Path) -> None:
    schedule = schedule_from_jolpica(2026, [QATAR, CHINA])
    schedule["rounds"].reverse()
    (tmp_path / "2026.json").write_text(json.dumps(schedule))

    assert [r.round for r in load_schedule(2026, tmp_path)] == [2, 22]


def test_the_shipped_2026_file_matches_the_calendar() -> None:
    rounds = load_schedule(2026)

    assert [r.round for r in rounds] == list(range(1, 24))
    assert [r.round for r in rounds if r.sprint] == [2, 4, 5, 9, 12, 17]
    qatar = rounds[21]
    assert qatar.circuit_ref == "losail"
    assert qatar.race.start == datetime(2026, 11, 29, 16, 0, tzinfo=UTC)
    for r in rounds:
        assert r.race.name == "race"
        starts = [s.start for s in r.sessions]
        assert all(starts), f"round {r.round} has a session with no time"
        assert starts == sorted(starts)
        assert len(r.sessions) == 5  # three practices, or sprint qualifying + sprint


def _fetch_schedule():
    """scripts/fetch_schedule.py, which isn't a package, loaded by path."""
    if "fetch_schedule" in sys.modules:
        return sys.modules["fetch_schedule"]
    path = Path(__file__).resolve().parents[1] / "scripts" / "fetch_schedule.py"
    spec = importlib.util.spec_from_file_location("fetch_schedule", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["fetch_schedule"] = module
    spec.loader.exec_module(module)
    return module


def _jolpica(*responses: httpx.Response) -> tuple[httpx.Client, list[str]]:
    seen: list[str] = []
    queue = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return queue.pop(0)

    return httpx.Client(transport=httpx.MockTransport(handler)), seen


def _races_page(races: list[dict], total: int | None = None) -> httpx.Response:
    total = len(races) if total is None else total
    body = {"MRData": {"total": str(total), "RaceTable": {"Races": races}}}
    return httpx.Response(200, json=body)


def test_the_script_writes_the_season_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    script = _fetch_schedule()
    monkeypatch.setattr(script, "_BACKOFF_SECONDS", 0)
    client, seen = _jolpica(httpx.Response(429), _races_page([QATAR, CHINA]))

    assert script.main(["--season", "2026", "--out-dir", str(tmp_path)], client) == 0
    assert seen == ["https://api.jolpi.ca/ergast/f1/2026.json?limit=100"] * 2
    written = json.loads((tmp_path / "2026.json").read_text())
    assert [r["round"] for r in written["rounds"]] == [2, 22]
    assert written["source"].startswith("Jolpica")


def test_the_script_refuses_a_short_page(tmp_path: Path) -> None:
    script = _fetch_schedule()
    client, _ = _jolpica(_races_page([QATAR], total=23))

    with pytest.raises(RuntimeError, match="listed 23, sent 1"):
        script.main(["--season", "2026", "--out-dir", str(tmp_path)], client)
    assert not (tmp_path / "2026.json").exists()
