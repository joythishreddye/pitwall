"""Ingest structured F1 data from the Jolpica (Ergast mirror) API.

Covers: circuits, drivers, constructors, races, race_results,
qualifying_results, standings for 2018-present.
"""

import logging
from datetime import datetime

import httpx
from supabase import Client

from app.db.supabase import fetch_all
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
            http,
            url,
            rl,
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


def ingest_circuits(supabase: Client, http: httpx.Client, rl: RateLimiter) -> int:
    """Fetch and upsert all circuits."""
    circuits = _fetch_all_pages(
        http,
        rl,
        f"{BASE_URL}/circuits.json",
        "CircuitTable",
        "Circuits",
    )
    rows = [_map_circuit(c) for c in circuits]
    count = batch_upsert(supabase, "circuits", rows, on_conflict="ref")
    logger.info("Circuits: %d upserted", count)
    return count


def ingest_drivers(supabase: Client, http: httpx.Client, rl: RateLimiter) -> int:
    """Fetch and upsert all drivers (paginated — ~900 total)."""
    all_drivers = _fetch_all_pages(
        http,
        rl,
        f"{BASE_URL}/drivers.json",
        "DriverTable",
        "Drivers",
    )
    rows = [_map_driver(d) for d in all_drivers]
    count = batch_upsert(supabase, "drivers", rows, on_conflict="ref")
    logger.info("Drivers: %d upserted", count)
    return count


def ingest_constructors(supabase: Client, http: httpx.Client, rl: RateLimiter) -> int:
    """Fetch and upsert all constructors."""
    all_constructors = _fetch_all_pages(
        http,
        rl,
        f"{BASE_URL}/constructors.json",
        "ConstructorTable",
        "Constructors",
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
            http,
            rl,
            f"{BASE_URL}/{season}.json",
            "RaceTable",
            "Races",
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
            http,
            rl,
            f"{BASE_URL}/{season}/results.json",
            "RaceTable",
            "Races",
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
                supabase,
                "race_results",
                rows,
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
                http,
                rl,
                f"{BASE_URL}/{season}/qualifying.json",
                "RaceTable",
                "Races",
            )
        except Exception:
            logger.warning("No qualifying data for %d", season)
            continue
        # Merge qualifying from duplicate race entries across pages
        merged: dict[tuple, list] = {}
        for race in raw_races:
            key = (int(race["season"]), int(race["round"]))
            merged.setdefault(key, []).extend(race.get("QualifyingResults", []))

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
                supabase,
                "qualifying_results",
                rows,
                on_conflict="race_id,driver_id",
            )
        logger.info("Qualifying %d: %d upserted", season, season_count)
        total += season_count
    return total


# The two kinds of standings: Jolpica's path name, its list key, its entity key
_STANDINGS_KINDS = (
    ("driver", "driverStandings", "DriverStandings", "Driver", "driverId"),
    (
        "constructor",
        "constructorStandings",
        "ConstructorStandings",
        "Constructor",
        "constructorId",
    ),
)


def _standings_rows(
    standings_list: dict,
    season: int,
    kind: str,
    list_key: str,
    entity_key: str,
    id_key: str,
    lookup: dict[str, int],
) -> tuple[int, list[dict]]:
    """Map one Jolpica StandingsList to (its round, standings table rows)."""
    rnd = int(standings_list.get("round", 0))
    rows = []
    for entry in standings_list.get(list_key, []):
        entity_id = lookup.get(entry[entity_key][id_key])
        if entity_id is None:
            continue
        rows.append(
            {
                "season": season,
                "round": rnd,
                "type": kind,
                "entity_id": entity_id,
                "position": safe_int(entry["position"]),
                "points": safe_float(entry["points"], 0.0),
                "wins": safe_int(entry.get("wins"), 0),
            }
        )
    return rnd, rows


def _stored_standings_rounds(supabase: Client, season: int, kind: str) -> set[int]:
    """The rounds that already have standings rows of this kind."""
    rows = fetch_all(
        lambda: supabase.table("standings")
        .select("id, round")
        .eq("season", season)
        .eq("type", kind)
        .order("id")
    )
    return {row["round"] for row in rows}


def ingest_standings(
    supabase: Client,
    http: httpx.Client,
    rl: RateLimiter,
    seasons: list[int],
    driver_lookup: dict[str, int],
    constructor_lookup: dict[str, int],
    *,
    every_round: bool = False,
) -> int:
    """Fetch and upsert each season's latest standings.

    With ``every_round``, also fetch the standings after each earlier round
    that has no stored rows yet, so points can be charted round by round with
    sprints included. Only missing rounds are fetched: about two calls per
    round the first time, none after that.
    """
    lookups = {"driver": driver_lookup, "constructor": constructor_lookup}
    total = 0
    for season in seasons:
        for kind, path, list_key, entity_key, id_key in _STANDINGS_KINDS:
            try:
                data = fetch_json(http, f"{BASE_URL}/{season}/{path}.json", rl)
                standings_list = data.get("StandingsTable", {}).get(
                    "StandingsLists", []
                )
                if not standings_list:
                    continue
                latest, rows = _standings_rows(
                    standings_list[0],
                    season,
                    kind,
                    list_key,
                    entity_key,
                    id_key,
                    lookups[kind],
                )
                total += batch_upsert(
                    supabase,
                    "standings",
                    rows,
                    on_conflict="season,round,type,entity_id",
                )
                if not every_round:
                    continue
                stored = _stored_standings_rounds(supabase, season, kind)
                for rnd in range(1, latest):
                    if rnd in stored:
                        continue
                    # A round that fails doesn't stop the later ones; the next
                    # run tries it again
                    try:
                        data = fetch_json(
                            http, f"{BASE_URL}/{season}/{rnd}/{path}.json", rl
                        )
                        lists = data.get("StandingsTable", {}).get("StandingsLists", [])
                        if not lists:
                            logger.warning(
                                "No %s standings for %d round %d", kind, season, rnd
                            )
                            continue
                        _, rows = _standings_rows(
                            lists[0],
                            season,
                            kind,
                            list_key,
                            entity_key,
                            id_key,
                            lookups[kind],
                        )
                        total += batch_upsert(
                            supabase,
                            "standings",
                            rows,
                            on_conflict="season,round,type,entity_id",
                        )
                    except Exception as exc:
                        logger.warning(
                            "%s standings for %d round %d failed: %s",
                            kind,
                            season,
                            rnd,
                            exc,
                        )
            except Exception as exc:
                # One season's failure doesn't stop the others; the next run
                # fetches whatever rounds are still missing
                logger.warning("%s standings for %d stopped: %s", kind, season, exc)

    logger.info("Standings: %d total upserted", total)
    return total


# ── Main entry point ─────────────────────────────────────────────


def run_jolpica_ingest(
    supabase: Client,
    seasons: list[int] | None = None,
    *,
    standings_every_round: bool = False,
) -> dict[str, int]:
    """Run the full Jolpica ingestion pipeline.

    ``standings_every_round`` also fills in the standings after every earlier
    round of each season that has none stored (see ingest_standings).

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
            supabase,
            http,
            rl,
            seasons,
            race_lookup,
            driver_lookup,
            constructor_lookup,
        )
        counts["qualifying_results"] = ingest_qualifying(
            supabase,
            http,
            rl,
            seasons,
            race_lookup,
            driver_lookup,
            constructor_lookup,
        )
        counts["standings"] = ingest_standings(
            supabase,
            http,
            rl,
            seasons,
            driver_lookup,
            constructor_lookup,
            every_round=standings_every_round,
        )

    logger.info("Jolpica ingest complete: %s", counts)
    return counts
