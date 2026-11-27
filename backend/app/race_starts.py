"""Race start times Jolpica stores wrong, fixed by a small file the code ships with.

``app/data/overrides/race_starts.json`` maps a season and a round to the race's
real start, in Jolpica's own time format ("17:00:00Z"); keys starting with "_" are
notes. The seed (app/ingestion/jolpica_ingest.py) and the session times file
(app/schedule.py, written by scripts/fetch_schedule.py) both apply it, so every
refresh keeps the fixed time. Standard library only, like app.schedule.
"""

from __future__ import annotations

import json
import re
from functools import cache
from pathlib import Path

PATH = Path(__file__).resolve().parent / "data" / "overrides" / "race_starts.json"
_TIME = re.compile(r"([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ")


def load_overrides(path: Path = PATH) -> dict[tuple[int, int], str]:
    """{(season, round): "HH:MM:SSZ"}. A malformed entry raises ValueError, so a
    typo fails the tests instead of shifting a race.
    """
    data = json.loads(path.read_text())
    out = {}
    for season, rounds in data.items():
        if season.startswith("_"):
            continue
        for rnd, time in rounds.items():
            if not isinstance(time, str) or not _TIME.fullmatch(time):
                raise ValueError(f"{season} round {rnd}: {time!r} isn't HH:MM:SSZ")
            out[(int(season), int(rnd))] = time
    return out


@cache
def _overrides() -> dict[tuple[int, int], str]:
    return load_overrides()


def race_time(
    season: int | str, rnd: int | str, jolpica_time: str | None
) -> str | None:
    """The race's start time: the override when there is one, else Jolpica's."""
    return _overrides().get((int(season), int(rnd)), jolpica_time)
