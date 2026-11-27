"""Race starts Jolpica stores wrong: the overrides file, the seed, the session times."""

import json
from pathlib import Path

import pytest

from app.ingestion.jolpica_ingest import _map_race
from app.race_starts import PATH, load_overrides, race_time
from app.schedule import DATA_DIR, load_schedule, round_from_jolpica

# Miami 2026 as Jolpica serves it: the race at 20:00 UTC, three hours late
MIAMI = {
    "season": "2026",
    "round": "4",
    "raceName": "Miami Grand Prix",
    "Circuit": {"circuitId": "miami"},
    "date": "2026-05-03",
    "time": "20:00:00Z",
    "FirstPractice": {"date": "2026-05-01", "time": "16:00:00Z"},
    "Qualifying": {"date": "2026-05-02", "time": "20:00:00Z"},
}
CHINA = {
    "season": "2026",
    "round": "2",
    "raceName": "Chinese Grand Prix",
    "Circuit": {"circuitId": "shanghai"},
    "date": "2026-03-15",
    "time": "07:00:00Z",
}


def test_miami_2026_starts_at_17_utc() -> None:
    assert load_overrides()[(2026, 4)] == "17:00:00Z"
    assert race_time("2026", "4", "20:00:00Z") == "17:00:00Z"


def test_every_other_race_keeps_jolpicas_time() -> None:
    assert race_time(2026, 2, "07:00:00Z") == "07:00:00Z"
    assert race_time(2025, 4, "19:00:00Z") == "19:00:00Z"
    assert race_time(2026, 5, None) is None


def test_the_seed_writes_17_utc_for_miami_and_jolpicas_time_elsewhere() -> None:
    circuits = {"miami": 1, "shanghai": 2}
    assert _map_race(MIAMI, circuits)["time"] == "17:00:00"
    assert _map_race(CHINA, circuits)["time"] == "07:00:00"


def test_the_session_times_fix_only_miamis_race() -> None:
    sessions = {s["name"]: s["start"] for s in round_from_jolpica(MIAMI)["sessions"]}
    assert sessions == {
        "practice_1": "2026-05-01T16:00:00Z",
        "qualifying": "2026-05-02T20:00:00Z",  # qualifying's own time is right
        "race": "2026-05-03T17:00:00Z",
    }
    china = round_from_jolpica(CHINA)["sessions"]
    assert china[-1]["start"] == "2026-03-15T07:00:00Z"


def test_the_committed_session_times_file_has_the_fix() -> None:
    miami = next(r for r in load_schedule(2026, DATA_DIR) if r.round == 4)
    assert miami.race.start.isoformat() == "2026-05-03T17:00:00+00:00"


def test_every_override_is_in_the_file_and_well_formed() -> None:
    data = json.loads(PATH.read_text())
    assert data["_source"]  # says where the right time came from
    seasons = {k: v for k, v in data.items() if not k.startswith("_")}
    assert sum(len(v) for v in seasons.values()) == len(load_overrides())


@pytest.mark.parametrize("bad", ["17:00", "17:00:00", "25:00:00Z", 1700, None])
def test_a_malformed_override_fails_loudly(tmp_path: Path, bad: object) -> None:
    p = tmp_path / "race_starts.json"
    p.write_text(json.dumps({"2026": {"4": bad}}))
    with pytest.raises(ValueError, match="HH:MM:SSZ"):
        load_overrides(p)
