"""Each round's session start times, from a static file per season.

The races table stores only the race's own date and time, and a new table would
be a migration, so the weekend's sessions ship with the code as
``app/data/schedule/<season>.json``. scripts/fetch_schedule.py writes the file
from Jolpica's season schedule. Standard library only: the script and the
briefing code load it without the app's settings.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data" / "schedule"
SOURCE = "Jolpica F1 API (api.jolpi.ca), CC BY-NC-SA 4.0"

# Jolpica's key for each session before the race, and the name stored here
_JOLPICA_SESSIONS = (
    ("FirstPractice", "practice_1"),
    ("SecondPractice", "practice_2"),
    ("ThirdPractice", "practice_3"),
    ("SprintQualifying", "sprint_qualifying"),
    ("Sprint", "sprint"),
    ("Qualifying", "qualifying"),
)


@dataclass(frozen=True)
class Session:
    name: str  # practice_1 to practice_3, sprint_qualifying, sprint, qualifying, race
    date: date
    # None when the schedule gives a date but no time: show the date, no countdown
    start: datetime | None


@dataclass(frozen=True)
class RoundSchedule:
    season: int
    round: int
    race_name: str
    circuit_ref: str
    sprint: bool
    sessions: tuple[Session, ...]

    @property
    def race(self) -> Session:
        return self.sessions[-1]


def _session(name: str, entry: dict[str, Any]) -> dict[str, str | None]:
    """One session as stored: its date, and its UTC start when there's a time."""
    day = date.fromisoformat(entry["date"])
    time = entry.get("time")
    start = None
    if time:
        start = datetime.fromisoformat(f"{day.isoformat()}T{time}")
        # Jolpica's times are UTC: one without a zone is UTC too, never the
        # local time of the machine running the script
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        start = start.astimezone(UTC)
    return {
        "name": name,
        "date": day.isoformat(),
        "start": start.isoformat().replace("+00:00", "Z") if start else None,
    }


def round_from_jolpica(race: dict[str, Any]) -> dict[str, Any]:
    """Map one Jolpica Race to the stored round, sessions in start order."""
    sessions = [
        _session(name, race[key]) for key, name in _JOLPICA_SESSIONS if key in race
    ]
    sessions.sort(key=lambda s: (s["date"], s["start"] or "~"))
    # The race always comes last: its date and time sit at the top level
    sessions.append(_session("race", race))
    return {
        "round": int(race["round"]),
        "race_name": race["raceName"],
        "circuit_ref": race["Circuit"]["circuitId"],
        "sprint": "Sprint" in race,
        "sessions": sessions,
    }


def schedule_from_jolpica(season: int, races: list[dict[str, Any]]) -> dict[str, Any]:
    """The whole file for a season, from Jolpica's RaceTable.Races."""
    rounds = sorted(
        (round_from_jolpica(race) for race in races), key=lambda r: r["round"]
    )
    return {"season": season, "source": SOURCE, "rounds": rounds}


def _parse_start(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_schedule(season: int, data_dir: Path = DATA_DIR) -> list[RoundSchedule]:
    """Every round of ``season`` in round order, or [] when there's no file."""
    path = data_dir / f"{season}.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text())
    rounds = [
        RoundSchedule(
            season=data["season"],
            round=r["round"],
            race_name=r["race_name"],
            circuit_ref=r["circuit_ref"],
            sprint=r["sprint"],
            sessions=tuple(
                Session(
                    name=s["name"],
                    date=date.fromisoformat(s["date"]),
                    start=_parse_start(s["start"]),
                )
                for s in r["sessions"]
            ),
        )
        for r in data["rounds"]
    ]
    # The script writes rounds in order, but a hand-edited file may not be
    return sorted(rounds, key=lambda r: r.round)
