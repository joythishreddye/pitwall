"""Driver headshot links, fetched between sessions and served with the data, so
no page calls OpenF1 (brief 002).

One static file per season, ``app/data/headshots/<season>.json``, written by
scripts/fetch_headshots.py: for each round, every driver in that race and his
photo link, or null when OpenF1 had no photo of him anywhere that season (a
stand-in, say). Standard library only, like app.schedule.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Iterable, Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data" / "headshots"
SOURCE = "OpenF1 API (api.openf1.org), CC BY-NC-SA 4.0"

# F1's own media host only: the link goes straight into an image on the page,
# so anything else (another host, http, a script URL, a query string) is dropped
_PHOTO_LINK = re.compile(r"https://media\.formula1\.com/[A-Za-z0-9_./-]+")
_CODE = re.compile(r"[A-Z]{3}")
_ROUND = re.compile(r"[1-9][0-9]*")


def is_photo_link(value: object) -> bool:
    return isinstance(value, str) and _PHOTO_LINK.fullmatch(value) is not None


def links_by_round(
    entries: Mapping[int, Iterable[Mapping[str, Any]]],
) -> dict[int, dict[str, str | None]]:
    """Each round's drivers and one photo link each, from OpenF1's driver lists.

    ``entries`` maps a round to OpenF1's ``/v1/drivers`` rows for its race. A
    driver with no usable link in a round takes his link from the nearest round
    that has one (the earlier one on a tie), so a stand-in weekend without a
    photo still shows his face; a driver with none all season gets None, and the
    page shows his code.
    """
    rounds: dict[int, dict[str, str | None]] = {}
    for rnd in sorted(entries):
        drivers: dict[str, str | None] = {}
        for row in entries[rnd]:
            code = row.get("name_acronym")
            if not isinstance(code, str) or not _CODE.fullmatch(code):
                raise ValueError(f"round {rnd}: bad driver code {code!r}")
            if code in drivers:
                raise ValueError(f"round {rnd}: {code} listed twice")
            link = row.get("headshot_url")
            drivers[code] = link if is_photo_link(link) else None
        rounds[rnd] = drivers

    # Fill only from links OpenF1 gave, never from one filled here
    given = {rnd: dict(drivers) for rnd, drivers in rounds.items()}
    for rnd, drivers in rounds.items():
        # Nearest round first; at the same distance the earlier one wins
        nearest = sorted((abs(other - rnd), other) for other in given if other != rnd)
        for code in [c for c, link in drivers.items() if link is None]:
            drivers[code] = next(
                (given[o][code] for _, o in nearest if given[o].get(code)), None
            )
    return rounds


def season_file(season: int, rounds: Mapping[int, Mapping[str, str | None]]) -> dict:
    return {
        "season": season,
        "source": SOURCE,
        "rounds": {
            str(rnd): dict(sorted(rounds[rnd].items())) for rnd in sorted(rounds)
        },
    }


def _no_repeats(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    # json.loads keeps the last of a repeated key without a word
    repeated = [key for key, n in Counter(key for key, _ in pairs).items() if n > 1]
    if repeated:
        raise ValueError(f"repeated key {repeated[0]!r}")
    return dict(pairs)


def _load(path: Path, season: int) -> dict[int, dict[str, str | None]]:
    try:
        data = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_no_repeats
        )
    except ValueError as exc:
        raise ValueError(f"{path.name}: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("rounds"), dict):
        raise ValueError(f"{path.name}: not a season file")
    if data.get("season") != season:
        raise ValueError(f"{path.name}: season {data.get('season')!r}, not {season}")
    rounds: dict[int, dict[str, str | None]] = {}
    for key, drivers in data["rounds"].items():
        # Written as plain numbers, so "01" or " 1" can't stand in for round 1
        if not _ROUND.fullmatch(key) or not isinstance(drivers, dict):
            raise ValueError(f"{path.name}: round {key!r} isn't a round")
        rnd = int(key)
        for code, link in drivers.items():
            if not _CODE.fullmatch(code) or not (link is None or is_photo_link(link)):
                raise ValueError(f"{path.name}: round {rnd}, bad entry for {code!r}")
        rounds[rnd] = dict(drivers)
    return rounds


# A few seasons at most: the endpoint may pass any season a visitor asks for
@lru_cache(maxsize=8)
def _season(season: int, data_dir: Path) -> dict[int, dict[str, str | None]]:
    path = data_dir / f"{season}.json"
    return _load(path, season) if path.is_file() else {}


def headshot_url(
    season: int, round: int, code: str, data_dir: Path = DATA_DIR
) -> str | None:
    """The driver's photo link for ``round``, or from the latest earlier round
    he has one in (race week's next round isn't fetched until its race has
    drivers), or None: the page then shows his code."""
    rounds = _season(season, data_dir)
    for rnd in sorted((r for r in rounds if r <= round), reverse=True):
        link = rounds[rnd].get(code)
        if link is not None:
            return link
    return None
