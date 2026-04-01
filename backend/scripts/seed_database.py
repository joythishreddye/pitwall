#!/usr/bin/env python3
"""Seed the PitWall database with F1 data.

Usage:
    cd backend && python scripts/seed_database.py                # full seed
    cd backend && python scripts/seed_database.py --skip-fastf1  # jolpica only
    cd backend && python scripts/seed_database.py --seasons 2025  # single season
"""

import argparse
import logging
import sys
from datetime import datetime
from pathlib import Path

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.supabase import get_supabase, ping_supabase
from app.ingestion.fastf1_ingest import run_fastf1_ingest
from app.ingestion.jolpica_ingest import run_jolpica_ingest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("seed")

EXPECTED_COUNTS = {
    "circuits": 75,
    "drivers": 850,
    "constructors": 210,
    "races": 180,
    "race_results": 3500,
}

EXPECTED_COUNTS_FASTF1 = {
    "lap_summaries": 50000,
    "pit_stops": 1000,
    "weather_readings": 500,
}


def validate_counts(supabase) -> bool:
    """Check row counts against minimum expectations."""
    logger.info("─── Validation ───")
    all_ok = True
    for table, minimum in {**EXPECTED_COUNTS, **EXPECTED_COUNTS_FASTF1}.items():
        result = (
            supabase.table(table)
            .select("id", count="exact")
            .limit(0)
            .execute()
        )
        actual = result.count or 0
        status = "OK" if actual >= minimum else "LOW"
        if actual < minimum:
            all_ok = False
        logger.info("  %-25s %6d rows  (%s, min=%d)", table, actual, status, minimum)
    return all_ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed PitWall database with F1 data")
    parser.add_argument(
        "--seasons", type=int, nargs="+",
        help="Seasons to ingest (default: 2018-now Jolpica, 2022-now FastF1)",
    )
    parser.add_argument(
        "--skip-fastf1", action="store_true",
        help="Skip FastF1 ingestion (laps, pit stops, weather)",
    )
    args = parser.parse_args()

    supabase = get_supabase()

    # Verify connection
    logger.info("Verifying Supabase connection...")
    try:
        ping_supabase()
    except Exception as exc:
        logger.error("Cannot connect to Supabase: %s", exc)
        sys.exit(1)
    logger.info("Connected.")

    current_year = datetime.now().year

    # Jolpica
    jolpica_seasons = args.seasons or list(range(2018, current_year + 1))
    logger.info("═══ Jolpica Ingest (seasons %s) ═══", jolpica_seasons)
    run_jolpica_ingest(supabase, seasons=jolpica_seasons)

    # FastF1
    if not args.skip_fastf1:
        fastf1_seasons = args.seasons or list(range(2022, current_year + 1))
        # Clamp to 2022+ (FastF1 data not available before)
        fastf1_seasons = [s for s in fastf1_seasons if s >= 2022]
        if fastf1_seasons:
            logger.info("═══ FastF1 Ingest (seasons %s) ═══", fastf1_seasons)
            run_fastf1_ingest(supabase, seasons=fastf1_seasons)
        else:
            logger.info("No FastF1-eligible seasons in range, skipping")
    else:
        logger.info("Skipping FastF1 (--skip-fastf1)")

    # Validate
    logger.info("═══ Validation ═══")
    ok = validate_counts(supabase)
    if ok:
        logger.info("All counts meet expectations.")
    else:
        logger.warning("Some counts below expectations — check logs above.")


if __name__ == "__main__":
    main()
