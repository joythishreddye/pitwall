#!/usr/bin/env python3
"""Write a season's driver photo links to app/data/headshots/<season>.json.

Usage (from backend/):
    python scripts/fetch_headshots.py --season 2026

Run it between sessions, after the season's schedule file exists
(scripts/fetch_schedule.py), and commit the file it writes. Public OpenF1
requests only, no keys and no database: one for the season's races, then one per
round, paced under OpenF1's free limits (3 a second and 30 a minute). During
any live session OpenF1 answers 401 to everyone, so the script stops without
writing; run it again afterwards.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, date, datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.headshots import DATA_DIR, links_by_round, season_file
from app.schedule import DATA_DIR as SCHEDULE_DIR
from app.schedule import load_schedule

OPENF1 = "https://api.openf1.org/v1"
# OpenF1's free tier allows 3 requests a second and 30 a minute: one every 2.1 s
# stays under both, about 50 s for a 23-round season
_PAUSE_SECONDS = 2.1


class LiveSessionLock(RuntimeError):
    """OpenF1 answered 401: a live session is on."""


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    response = client.get(f"{OPENF1}/{path}", params=params)
    if response.status_code == 401:
        raise LiveSessionLock("OpenF1 is locked during a live session; run it later")
    if response.status_code == 404 and _no_results(response):
        # OpenF1's answer when nothing matches, a race with no drivers yet say
        return []
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, list):
        # Not OpenF1's usual answer: stop rather than write a season short of
        # a round
        raise ValueError(f"OpenF1 {path}: expected a list, got {type(data).__name__}")
    return data


def _no_results(response: httpx.Response) -> bool:
    try:
        return response.json() == {"detail": "No results found."}
    except ValueError:
        return False


def fetch_entries(
    season: int,
    race_days: dict[str, int],
    client: httpx.Client,
    today: date | None = None,
) -> dict[int, list[dict]]:
    """Each round's OpenF1 driver rows, its race matched to the round by date.

    ``race_days`` maps each race's date (YYYY-MM-DD, UTC) to its round. OpenF1
    keeps races the calendar dropped (2026's Bahrain and Saudi Arabia), so a race
    on a date with no round is skipped, as is a round not yet run whose race has
    no drivers yet. A round already run stops it if its date matches no OpenF1
    race (the schedule's date is off: a local date, say) or its race has no
    drivers: either way the round would be lost from the file.
    """
    races = _get(client, "sessions", {"year": season, "session_name": "Race"})
    run_before = (today or datetime.now(UTC).date()).isoformat()
    matched = {race_days.get(r["date_start"][:10]) for r in races}
    lost = sorted(
        rnd for day, rnd in race_days.items() if day < run_before and rnd not in matched
    )
    if lost:
        raise ValueError(f"no OpenF1 race on the schedule's date for rounds {lost}")
    entries: dict[int, list[dict]] = {}
    for race in sorted(races, key=lambda r: r["date_start"]):
        rnd = race_days.get(race["date_start"][:10])
        if rnd is None or rnd in entries:
            continue
        time.sleep(_PAUSE_SECONDS)
        rows = _get(client, "drivers", {"session_key": race["session_key"]})
        if rows:
            entries[rnd] = rows
    empty = sorted(
        rnd for day, rnd in race_days.items() if day < run_before and rnd not in entries
    )
    if empty:
        raise ValueError(f"no OpenF1 drivers for rounds {empty}, though they've run")
    return entries


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--out-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--schedule-dir", type=Path, default=SCHEDULE_DIR)
    args = parser.parse_args(argv)

    schedule = load_schedule(args.season, args.schedule_dir)
    if not schedule:
        print(f"No schedule file for {args.season}: run scripts/fetch_schedule.py")
        return 1
    race_days = {r.race.date.isoformat(): r.round for r in schedule}

    try:
        with client or httpx.Client(timeout=30, follow_redirects=True) as http:
            entries = fetch_entries(args.season, race_days, http)
    except LiveSessionLock as exc:
        print(f"{exc}; nothing written")
        return 1
    if not entries:
        print(f"No drivers for {args.season} yet; nothing written")
        return 1

    rounds = links_by_round(entries)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = args.out_dir / f"{args.season}.json"
    # Written beside the old file and swapped in whole, so a failed write leaves
    # the old file as it was
    tmp = out.with_name(f".{out.name}.tmp")
    try:
        tmp.write_text(json.dumps(season_file(args.season, rounds), indent=2) + "\n")
        os.replace(tmp, out)
    finally:
        tmp.unlink(missing_ok=True)
    missing = sorted({c for d in rounds.values() for c, link in d.items() if not link})
    print(
        f"Wrote {out}: {len(rounds)} rounds; no photo all season: "
        f"{', '.join(missing) or 'none'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
