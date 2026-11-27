#!/usr/bin/env python3
"""Write a season's session start times to app/data/schedule/<season>.json.

Usage (from backend/):
    python scripts/fetch_schedule.py --season 2026

One request to Jolpica's public schedule, no keys and no database. Rerun it when
the calendar changes, and commit the file it writes.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schedule import DATA_DIR, schedule_from_jolpica

JOLPICA = "https://api.jolpi.ca/ergast/f1"
# Jolpica asks clients to back off on a 429 (docs/briefs/002-race-data-spine.md)
_BACKOFF_SECONDS = 60
_ATTEMPTS = 3


def fetch_races(season: int, client: httpx.Client) -> list[dict]:
    """Jolpica's RaceTable.Races for ``season``: every round fits one page."""
    url = f"{JOLPICA}/{season}.json"
    for attempt in range(_ATTEMPTS):
        response = client.get(url, params={"limit": 100})
        if response.status_code == 429 and attempt < _ATTEMPTS - 1:
            time.sleep(_BACKOFF_SECONDS)
            continue
        response.raise_for_status()
        data = response.json()["MRData"]
        races = data["RaceTable"]["Races"]
        if int(data["total"]) != len(races):
            raise RuntimeError(f"Jolpica listed {data['total']}, sent {len(races)}")
        return races
    raise RuntimeError(f"Jolpica kept answering 429 for {url}")


def main(argv: list[str] | None = None, client: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--out-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args(argv)

    with client or httpx.Client(timeout=30, follow_redirects=True) as http:
        races = fetch_races(args.season, http)
    if not races:
        print(f"No races for {args.season}; nothing written")
        return 1

    schedule = schedule_from_jolpica(args.season, races)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out = args.out_dir / f"{args.season}.json"
    out.write_text(json.dumps(schedule, indent=2) + "\n")
    sprints = sum(r["sprint"] for r in schedule["rounds"])
    print(f"Wrote {out}: {len(schedule['rounds'])} rounds, {sprints} sprint weekends")
    return 0


if __name__ == "__main__":
    sys.exit(main())
