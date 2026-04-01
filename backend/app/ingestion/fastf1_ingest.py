"""Ingest detailed session data from FastF1.

Covers: lap_summaries, pit_stops, weather_readings for 2022-present.
"""

import logging
import warnings
from datetime import datetime

import fastf1
import pandas as pd
from supabase import Client

from app.config import settings
from app.ingestion._helpers import (
    BATCH_SIZE,
    batch_upsert,
    build_race_lookup,
    td_to_ms,
)

logger = logging.getLogger(__name__)


def _safe_val(series_row, key, cast=float):
    """Extract a value from a Series/row, return None if NaN/NaT/NA."""
    v = series_row.get(key)
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    try:
        return cast(v)
    except (ValueError, TypeError):
        return None


def _init_cache() -> None:
    fastf1.Cache.enable_cache(settings.fastf1_cache_dir)


def _build_driver_code_lookup(supabase: Client) -> dict[str, int]:
    """Map 3-letter driver codes to database IDs."""
    rows = (
        supabase.table("drivers")
        .select("id, code")
        .not_.is_("code", "null")
        .limit(10000)
        .execute()
        .data
    )
    return {r["code"]: r["id"] for r in rows}


def _ingest_laps(
    supabase: Client,
    laps: pd.DataFrame,
    race_id: int,
    driver_code_lookup: dict[str, int],
) -> int:
    """Upsert lap summaries from a FastF1 laps DataFrame."""
    rows: list[dict] = []
    for _, lap in laps.iterrows():
        driver_id = driver_code_lookup.get(lap["Driver"])
        if driver_id is None:
            continue
        lap_num = int(lap["LapNumber"]) if not pd.isna(lap["LapNumber"]) else None
        if lap_num is None:
            continue
        pos = _safe_val(lap, "Position", int)
        compound = lap.get("Compound")
        if pd.isna(compound):
            compound = None
        rows.append({
            "race_id": race_id,
            "driver_id": driver_id,
            "lap_number": lap_num,
            "position": pos,
            "time_millis": td_to_ms(lap.get("LapTime")),
            "sector1_ms": td_to_ms(lap.get("Sector1Time")),
            "sector2_ms": td_to_ms(lap.get("Sector2Time")),
            "sector3_ms": td_to_ms(lap.get("Sector3Time")),
            "compound": compound,
            "tyre_life": _safe_val(lap, "TyreLife", int),
            "is_pit_in": not pd.isna(lap.get("PitInTime")),
            "is_pit_out": not pd.isna(lap.get("PitOutTime")),
        })
    return batch_upsert(
        supabase, "lap_summaries", rows,
        on_conflict="race_id,driver_id,lap_number",
    )


def _ingest_pit_stops(
    supabase: Client,
    laps: pd.DataFrame,
    race_id: int,
    driver_code_lookup: dict[str, int],
) -> int:
    """Derive pit stops from laps where PitInTime is set.

    PitInTime is on the in-lap; PitOutTime is on the following
    out-lap. We pair them to compute stationary duration.
    """
    rows: list[dict] = []
    for driver_code, driver_laps in laps.groupby("Driver"):
        driver_id = driver_code_lookup.get(driver_code)
        if driver_id is None:
            continue
        dlaps = driver_laps.sort_values("LapNumber")
        pit_in_laps = dlaps[dlaps["PitInTime"].notna()]
        stop_num = 0
        for _, lap in pit_in_laps.iterrows():
            stop_num += 1
            pit_in = lap["PitInTime"]
            lap_num = int(lap["LapNumber"])

            # Find the next lap for this driver to get PitOutTime
            duration_ms = None
            next_laps = dlaps[dlaps["LapNumber"] > lap_num]
            if not next_laps.empty:
                next_lap = next_laps.iloc[0]
                pit_out = next_lap.get("PitOutTime")
                if not pd.isna(pit_out) and pit_out > pit_in:
                    delta = (pit_out - pit_in).total_seconds()
                    duration_ms = int(delta * 1000)

            rows.append({
                "race_id": race_id,
                "driver_id": driver_id,
                "stop_number": stop_num,
                "lap": lap_num,
                "duration_ms": duration_ms,
            })

    return batch_upsert(
        supabase, "pit_stops", rows,
        on_conflict="race_id,driver_id,stop_number",
    )


def _ingest_weather(
    supabase: Client,
    session: fastf1.core.Session,
    race_id: int,
) -> int:
    """Ingest weather readings mapped to lap numbers."""
    weather = session.weather_data
    if weather is None or weather.empty:
        return 0

    laps = session.laps
    if laps.empty:
        return 0

    # Build lap time boundaries to map weather timestamps to laps
    # Use the overall session laps to find each lap's approximate time range
    lap_times = (
        laps.groupby("LapNumber")
        .agg(start=("LapStartDate", "min"), end=("Time", "max"))
        .reset_index()
    )
    lap_times = lap_times.sort_values("LapNumber")

    rows: list[dict] = []
    # Sample one weather reading per 5 laps to keep storage manageable
    sample_laps = set(range(1, int(lap_times["LapNumber"].max()) + 1, 5))
    sample_laps.add(1)  # Always include first lap

    for _, lt in lap_times.iterrows():
        lap_num = int(lt["LapNumber"])
        if lap_num not in sample_laps:
            continue

        # Find weather readings closest to this lap's midpoint
        # weather.Time is a timedelta from session start
        if pd.isna(lt["start"]) or pd.isna(lt["end"]):
            continue

        # Just take the last weather reading before lap end
        mask = weather["Time"] <= lt["end"]
        if not mask.any():
            continue
        w = weather[mask].iloc[-1]

        rows.append({
            "race_id": race_id,
            "lap_number": lap_num,
            "air_temp": _safe_val(w, "AirTemp"),
            "track_temp": _safe_val(w, "TrackTemp"),
            "humidity": _safe_val(w, "Humidity"),
            "pressure": _safe_val(w, "Pressure"),
            "wind_speed": _safe_val(w, "WindSpeed"),
            "wind_direction": _safe_val(w, "WindDirection", int),
            "rainfall": bool(w.get("Rainfall", False)),
        })

    # Delete existing weather for this race, then plain insert
    supabase.table("weather_readings").delete().eq(
        "race_id", race_id
    ).execute()
    if not rows:
        return 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        supabase.table("weather_readings").insert(chunk).execute()
    return len(rows)


def _process_session(
    supabase: Client,
    year: int,
    round_num: int,
    race_id: int,
    driver_code_lookup: dict[str, int],
) -> dict[str, int]:
    """Load and ingest one race session."""
    counts = {"lap_summaries": 0, "pit_stops": 0, "weather_readings": 0}
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            session = fastf1.get_session(year, round_num, "R")
            session.load()
    except Exception:
        logger.warning("Could not load session %d round %d, skipping", year, round_num)
        return counts

    if session.laps is None or session.laps.empty:
        logger.warning("No lap data for %d round %d", year, round_num)
        return counts

    counts["lap_summaries"] = _ingest_laps(
        supabase, session.laps, race_id, driver_code_lookup
    )
    counts["pit_stops"] = _ingest_pit_stops(
        supabase, session.laps, race_id, driver_code_lookup
    )
    counts["weather_readings"] = _ingest_weather(supabase, session, race_id)

    logger.info(
        "Session %d R%d: %d laps, %d pits, %d weather",
        year, round_num,
        counts["lap_summaries"], counts["pit_stops"], counts["weather_readings"],
    )
    return counts


# ── Main entry point ─────────────────────────────────────────────


def run_fastf1_ingest(
    supabase: Client,
    seasons: list[int] | None = None,
) -> dict[str, int]:
    """Run the FastF1 ingestion pipeline.

    Returns dict of {table_name: total_rows_upserted}.
    """
    _init_cache()

    if seasons is None:
        current_year = datetime.now().year
        seasons = list(range(2022, current_year + 1))

    logger.info("FastF1 ingest: seasons %d-%d", seasons[0], seasons[-1])

    driver_code_lookup = _build_driver_code_lookup(supabase)
    race_lookup = build_race_lookup(supabase)

    totals: dict[str, int] = {"lap_summaries": 0, "pit_stops": 0, "weather_readings": 0}

    for year in seasons:
        try:
            schedule = fastf1.get_event_schedule(year, include_testing=False)
        except Exception:
            logger.warning("Could not get schedule for %d", year)
            continue

        for _, event in schedule.iterrows():
            round_num = int(event["RoundNumber"])
            if round_num == 0:
                continue  # testing session

            race_id = race_lookup.get((year, round_num))
            if race_id is None:
                logger.debug("Race %d R%d not in DB, skipping", year, round_num)
                continue

            # Incremental: skip if lap data already exists
            existing = (
                supabase.table("lap_summaries")
                .select("id", count="exact")
                .eq("race_id", race_id)
                .limit(0)
                .execute()
            )
            if existing.count and existing.count > 0:
                logger.debug(
                    "Skipping %d R%d — %d laps exist",
                    year, round_num, existing.count,
                )
                continue

            counts = _process_session(
                supabase, year, round_num, race_id, driver_code_lookup
            )
            for key, val in counts.items():
                totals[key] += val

    logger.info("FastF1 ingest complete: %s", totals)
    return totals
