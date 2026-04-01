"""Ingest structured F1 data from the Jolpica (Ergast mirror) API.

Covers: circuits, drivers, constructors, races, race_results,
qualifying_results, standings for 2018-present.
"""

import logging
from datetime import datetime

import httpx
from supabase import Client

from app.ingestion._helpers import (
    RateLimiter,
    batch_upsert,
    build_lookup,
    build_race_lookup,
    fetch_json,
    safe_float,
    safe_int,
)

logger = logging.getLogger(__name__)

BASE_URL = "http://api.jolpi.ca/ergast/f1"
PAGE_LIMIT = 100  # Jolpica API caps at ~100 results per page


def _fetch_all_pages(
    http: httpx.Client,
    rl: RateLimiter,
    url: str,
    table_key: str,
    list_key: str,
) -> list[dict]:
    """Fetch all pages from a paginated Jolpica endpoint.

    Always increments offset by PAGE_LIMIT (not by len of returned
    items) because the API's 'total' counts leaf entries, while
    the list may contain parent objects (e.g. Races with nested
    Results). Caller should deduplicate if the endpoint nests data.
    """
    all_items: list[dict] = []
    offset = 0
    while True:
        data = fetch_json(
            http, url, rl,
            params={"limit": PAGE_LIMIT, "offset": offset},
        )
        items = data.get(table_key, {}).get(list_key, [])
        all_items.extend(items)
        total = int(data.get("total", 0))
        if not items or offset + PAGE_LIMIT >= total:
            break
        offset += PAGE_LIMIT
    return all_items


def _map_circuit(c: dict) -> dict:
    loc = c.get("Location", {})
    return {
        "ref": c["circuitId"],
        "name": c["circuitName"],
        "location": loc.get("locality"),
        "country": loc.get("country"),
        "lat": safe_float(loc.get("lat")),
        "lng": safe_float(loc.get("long")),
        "url": c.get("url"),
    }


def _map_driver(d: dict) -> dict:
    return {
        "ref": d["driverId"],
        "number": safe_int(d.get("permanentNumber")),
        "code": d.get("code"),
        "forename": d["givenName"],
        "surname": d["familyName"],
        "dob": d.get("dateOfBirth"),
        "nationality": d.get("nationality"),
        "url": d.get("url"),
    }


def _map_constructor(c: dict) -> dict:
    return {
        "ref": c["constructorId"],
        "name": c["name"],
        "nationality": c.get("nationality"),
        "url": c.get("url"),
    }


def _map_race(r: dict, circuit_lookup: dict[str, int]) -> dict | None:
    circuit_ref = r["Circuit"]["circuitId"]
    circuit_id = circuit_lookup.get(circuit_ref)
    if circuit_id is None:
        logger.warning("Unknown circuit ref %s, skipping race", circuit_ref)
        return None
    time_str = r.get("time")
    if time_str:
        time_str = time_str.rstrip("Z")
    return {
        "season": int(r["season"]),
        "round": int(r["round"]),
        "name": r["raceName"],
        "circuit_id": circuit_id,
        "date": r["date"],
        "time": time_str,
        "url": r.get("url"),
    }


def _map_result(
    res: dict,
    race_id: int,
    driver_lookup: dict[str, int],
    constructor_lookup: dict[str, int],
) -> dict | None:
    driver_ref = res["Driver"]["driverId"]
    constructor_ref = res["Constructor"]["constructorId"]
    driver_id = driver_lookup.get(driver_ref)
    constructor_id = constructor_lookup.get(constructor_ref)
    if driver_id is None or constructor_id is None:
        logger.warning(
            "Unknown driver=%s or constructor=%s, skipping result",
            driver_ref,
            constructor_ref,
        )
        return None
    fastest = res.get("FastestLap", {})
    return {
        "race_id": race_id,
        "driver_id": driver_id,
        "constructor_id": constructor_id,
        "grid": safe_int(res.get("grid")),
        "position": safe_int(res.get("position")),
        "position_text": res.get("positionText"),
        "points": safe_float(res.get("points"), 0.0),
        "laps": safe_int(res.get("laps")),
        "status": res.get("status"),
        "time_millis": safe_int(res.get("Time", {}).get("millis")),
        "fastest_lap_rank": safe_int(fastest.get("rank")),
    }


def _map_qualifying(
    q: dict,
    race_id: int,
    driver_lookup: dict[str, int],
    constructor_lookup: dict[str, int],
) -> dict | None:
    driver_id = driver_lookup.get(q["Driver"]["driverId"])
    constructor_id = constructor_lookup.get(q["Constructor"]["constructorId"])
    if driver_id is None or constructor_id is None:
        return None
    return {
        "race_id": race_id,
        "driver_id": driver_id,
        "constructor_id": constructor_id,
        "position": safe_int(q.get("position")),
        "q1": q.get("Q1"),
        "q2": q.get("Q2"),
        "q3": q.get("Q3"),
    }


# ── Ingestion functions ──────────────────────────────────────────


def ingest_circuits(
    supabase: Client, http: httpx.Client, rl: RateLimiter
) -> int:
    """Fetch and upsert all circuits."""
    circuits = _fetch_all_pages(
        http, rl, f"{BASE_URL}/circuits.json",
        "CircuitTable", "Circuits",
    )
    rows = [_map_circuit(c) for c in circuits]
    count = batch_upsert(supabase, "circuits", rows, on_conflict="ref")
    logger.info("Circuits: %d upserted", count)
    return count


def ingest_drivers(
    supabase: Client, http: httpx.Client, rl: RateLimiter
) -> int:
    """Fetch and upsert all drivers (paginated — ~900 total)."""
    all_drivers = _fetch_all_pages(
        http, rl, f"{BASE_URL}/drivers.json",
        "DriverTable", "Drivers",
    )
    rows = [_map_driver(d) for d in all_drivers]
    count = batch_upsert(supabase, "drivers", rows, on_conflict="ref")
    logger.info("Drivers: %d upserted", count)
    return count


def ingest_constructors(
    supabase: Client, http: httpx.Client, rl: RateLimiter
) -> int:
    """Fetch and upsert all constructors."""
    all_constructors = _fetch_all_pages(
        http, rl, f"{BASE_URL}/constructors.json",
        "ConstructorTable", "Constructors",
    )
    rows = [_map_constructor(c) for c in all_constructors]
    count = batch_upsert(supabase, "constructors", rows, on_conflict="ref")
    logger.info("Constructors: %d upserted", count)
    return count


def ingest_races(
    supabase: Client,
    http: httpx.Client,
    rl: RateLimiter,
    seasons: list[int],
    circuit_lookup: dict[str, int],
) -> int:
    """Fetch and upsert race schedules for given seasons."""
    total = 0
    for season in seasons:
        races = _fetch_all_pages(
            http, rl, f"{BASE_URL}/{season}.json",
            "RaceTable", "Races",
        )
        rows = [r for r in (_map_race(race, circuit_lookup) for race in races) if r]
        count = batch_upsert(supabase, "races", rows, on_conflict="season,round")
        logger.info("Races %d: %d upserted", season, count)
        total += count
    return total


def ingest_results(
    supabase: Client,
    http: httpx.Client,
    rl: RateLimiter,
    seasons: list[int],
    race_lookup: dict[tuple[int, int], int],
    driver_lookup: dict[str, int],
    constructor_lookup: dict[str, int],
) -> int:
    """Fetch and upsert race results for given seasons."""
    total = 0
    for season in seasons:
        season_count = 0
        raw_races = _fetch_all_pages(
            http, rl, f"{BASE_URL}/{season}/results.json",
            "RaceTable", "Races",
        )
        # Merge results from duplicate race entries across pages
        merged: dict[tuple, list] = {}
        for race in raw_races:
            key = (int(race["season"]), int(race["round"]))
            merged.setdefault(key, []).extend(race.get("Results", []))

        for key, results in merged.items():
            race_id = race_lookup.get(key)
            if race_id is None:
                continue
            rows = [
                r
                for r in (
                    _map_result(res, race_id, driver_lookup, constructor_lookup)
                    for res in results
                )
                if r
            ]
            season_count += batch_upsert(
                supabase, "race_results", rows,
                on_conflict="race_id,driver_id",
            )
        logger.info("Results %d: %d upserted", season, season_count)
        total += season_count
    return total


def ingest_qualifying(
    supabase: Client,
    http: httpx.Client,
    rl: RateLimiter,
    seasons: list[int],
    race_lookup: dict[tuple[int, int], int],
    driver_lookup: dict[str, int],
    constructor_lookup: dict[str, int],
) -> int:
    """Fetch and upsert qualifying results for given seasons."""
    total = 0
    for season in seasons:
        season_count = 0
        try:
            raw_races = _fetch_all_pages(
                http, rl, f"{BASE_URL}/{season}/qualifying.json",
                "RaceTable", "Races",
            )
        except Exception:
            logger.warning("No qualifying data for %d", season)
            continue
        # Merge qualifying from duplicate race entries across pages
        merged: dict[tuple, list] = {}
        for race in raw_races:
            key = (int(race["season"]), int(race["round"]))
            merged.setdefault(key, []).extend(
                race.get("QualifyingResults", [])
            )

        for key, qual_results in merged.items():
            race_id = race_lookup.get(key)
            if race_id is None:
                continue
            rows = [
                r
                for r in (
                    _map_qualifying(q, race_id, driver_lookup, constructor_lookup)
                    for q in qual_results
                )
                if r
            ]
            season_count += batch_upsert(
                supabase, "qualifying_results", rows,
                on_conflict="race_id,driver_id",
            )
        logger.info("Qualifying %d: %d upserted", season, season_count)
        total += season_count
    return total


def ingest_standings(
    supabase: Client,
    http: httpx.Client,
    rl: RateLimiter,
    seasons: list[int],
    driver_lookup: dict[str, int],
    constructor_lookup: dict[str, int],
) -> int:
    """Fetch and upsert end-of-season standings."""
    total = 0
    for season in seasons:
        # Driver standings
        try:
            data = fetch_json(
                http, f"{BASE_URL}/{season}/driverStandings.json", rl,
            )
            standings_list = data.get("StandingsTable", {}).get("StandingsLists", [])
            if standings_list:
                sl = standings_list[0]
                rnd = int(sl.get("round", 0))
                rows = []
                for ds in sl.get("DriverStandings", []):
                    entity_id = driver_lookup.get(ds["Driver"]["driverId"])
                    if entity_id is None:
                        continue
                    rows.append({
                        "season": season,
                        "round": rnd,
                        "type": "driver",
                        "entity_id": entity_id,
                        "position": safe_int(ds["position"]),
                        "points": safe_float(ds["points"], 0.0),
                        "wins": safe_int(ds.get("wins"), 0),
                    })
                total += batch_upsert(
                    supabase, "standings", rows,
                    on_conflict="season,round,type,entity_id",
                )
        except Exception:
            logger.warning("No driver standings for %d", season)

        # Constructor standings
        try:
            data = fetch_json(
                http, f"{BASE_URL}/{season}/constructorStandings.json", rl,
            )
            standings_list = data.get("StandingsTable", {}).get("StandingsLists", [])
            if standings_list:
                sl = standings_list[0]
                rnd = int(sl.get("round", 0))
                rows = []
                for cs in sl.get("ConstructorStandings", []):
                    cref = cs["Constructor"]["constructorId"]
                    entity_id = constructor_lookup.get(cref)
                    if entity_id is None:
                        continue
                    rows.append({
                        "season": season,
                        "round": rnd,
                        "type": "constructor",
                        "entity_id": entity_id,
                        "position": safe_int(cs["position"]),
                        "points": safe_float(cs["points"], 0.0),
                        "wins": safe_int(cs.get("wins"), 0),
                    })
                total += batch_upsert(
                    supabase, "standings", rows,
                    on_conflict="season,round,type,entity_id",
                )
        except Exception:
            logger.warning("No constructor standings for %d", season)

    logger.info("Standings: %d total upserted", total)
    return total


# ── Main entry point ─────────────────────────────────────────────


def run_jolpica_ingest(
    supabase: Client,
    seasons: list[int] | None = None,
) -> dict[str, int]:
    """Run the full Jolpica ingestion pipeline.

    Returns dict of {table_name: rows_upserted}.
    """
    if seasons is None:
        current_year = datetime.now().year
        seasons = list(range(2018, current_year + 1))

    logger.info("Jolpica ingest: seasons %d-%d", seasons[0], seasons[-1])
    rl = RateLimiter()

    with httpx.Client(timeout=30, follow_redirects=True) as http:
        # Phase 1: reference data
        counts: dict[str, int] = {}
        counts["circuits"] = ingest_circuits(supabase, http, rl)
        counts["drivers"] = ingest_drivers(supabase, http, rl)
        counts["constructors"] = ingest_constructors(supabase, http, rl)

        # Build lookups
        circuit_lookup = build_lookup(supabase, "circuits", "ref")
        driver_lookup = build_lookup(supabase, "drivers", "ref")
        constructor_lookup = build_lookup(supabase, "constructors", "ref")

        # Phase 2: races
        counts["races"] = ingest_races(supabase, http, rl, seasons, circuit_lookup)

        # Rebuild race lookup after races are inserted
        race_lookup = build_race_lookup(supabase)

        # Phase 3: results, qualifying, standings
        counts["race_results"] = ingest_results(
            supabase, http, rl, seasons, race_lookup, driver_lookup, constructor_lookup,
        )
        counts["qualifying_results"] = ingest_qualifying(
            supabase, http, rl, seasons, race_lookup, driver_lookup, constructor_lookup,
        )
        counts["standings"] = ingest_standings(
            supabase, http, rl, seasons, driver_lookup, constructor_lookup,
        )

    logger.info("Jolpica ingest complete: %s", counts)
    return counts
