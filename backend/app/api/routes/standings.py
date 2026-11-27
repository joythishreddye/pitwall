"""Standings router — driver and constructor championship standings."""

import logging
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import Client

from app.db.supabase import fetch_all, get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/standings", tags=["standings"])


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_db() -> Client:
    """Return the Supabase singleton client."""
    return get_supabase()


DB = Annotated[Client, Depends(get_db)]


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class DriverStandingEntry(BaseModel):
    position: int
    points: float
    wins: int
    driver_id: int
    driver_ref: str
    driver_code: str | None = None
    forename: str
    surname: str
    nationality: str | None = None
    constructor_name: str | None = None
    constructor_ref: str | None = None


class ConstructorStandingEntry(BaseModel):
    position: int
    points: float
    wins: int
    constructor_id: int
    constructor_ref: str
    name: str
    nationality: str | None = None


class StandingsResponse(BaseModel):
    season: int
    round: int
    driver_standings: list[DriverStandingEntry] | None = None
    constructor_standings: list[ConstructorStandingEntry] | None = None


class DriverPointsProgression(BaseModel):
    driver_ref: str
    surname: str
    constructor_ref: str
    rounds: list[int]
    points: list[float]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _latest_round(db: Client, season: int) -> int | None:
    """Return the highest round number present in standings for a season."""
    result = (
        db.table("standings")
        .select("round")
        .eq("season", season)
        .order("round", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0]["round"] if rows else None


def _fetch_driver_standings(
    db: Client, season: int, round_number: int
) -> list[DriverStandingEntry]:
    """Fetch driver standings for the given season/round, joined with driver data."""
    standings_result = (
        db.table("standings")
        .select("*")
        .eq("season", season)
        .eq("round", round_number)
        .eq("type", "driver")
        .order("position")
        .execute()
    )
    standing_rows = standings_result.data or []

    if not standing_rows:
        return []

    # Collect all driver ids to fetch in one query
    driver_ids = [row["entity_id"] for row in standing_rows]
    drivers_result = (
        db.table("drivers")
        .select("id, ref, code, forename, surname, nationality")
        .in_("id", driver_ids)
        .execute()
    )
    drivers_map: dict[int, dict] = {d["id"]: d for d in (drivers_result.data or [])}

    # For current constructor we look at race_results for this season's races
    # and grab the constructor name.
    season_race_ids_result = (
        db.table("races").select("id").eq("season", season).execute()
    )
    season_race_ids = [r["id"] for r in (season_race_ids_result.data or [])]

    constructors_result = (
        (
            db.table("race_results")
            .select("driver_id, constructors(name, ref)")
            .in_("driver_id", driver_ids)
            .in_("race_id", season_race_ids)
            .execute()
        )
        if season_race_ids
        else type("R", (), {"data": []})()
    )
    # Build maps: driver_id -> constructor name/ref (last row wins for the season)
    constructor_name_map: dict[int, str] = {}
    constructor_ref_map: dict[int, str] = {}
    for rr in constructors_result.data or []:
        did = rr["driver_id"]
        c = rr.get("constructors")
        if c:
            if c.get("name"):
                constructor_name_map[did] = c["name"]
            if c.get("ref"):
                constructor_ref_map[did] = c["ref"]

    entries: list[DriverStandingEntry] = []
    for row in standing_rows:
        did = row["entity_id"]
        driver = drivers_map.get(did, {})
        entries.append(
            DriverStandingEntry(
                position=row["position"],
                points=float(row["points"]),
                wins=int(row.get("wins") or 0),
                driver_id=did,
                driver_ref=driver.get("ref", ""),
                driver_code=driver.get("code"),
                forename=driver.get("forename", ""),
                surname=driver.get("surname", ""),
                nationality=driver.get("nationality"),
                constructor_name=constructor_name_map.get(did),
                constructor_ref=constructor_ref_map.get(did),
            )
        )
    return entries


def _fetch_constructor_standings(
    db: Client, season: int, round_number: int
) -> list[ConstructorStandingEntry]:
    """Fetch constructor standings for the given season/round."""
    standings_result = (
        db.table("standings")
        .select("*")
        .eq("season", season)
        .eq("round", round_number)
        .eq("type", "constructor")
        .order("position")
        .execute()
    )
    standing_rows = standings_result.data or []

    if not standing_rows:
        return []

    constructor_ids = [row["entity_id"] for row in standing_rows]
    constructors_result = (
        db.table("constructors")
        .select("id, ref, name, nationality")
        .in_("id", constructor_ids)
        .execute()
    )
    constructors_map: dict[int, dict] = {
        c["id"]: c for c in (constructors_result.data or [])
    }

    entries: list[ConstructorStandingEntry] = []
    for row in standing_rows:
        cid = row["entity_id"]
        constructor = constructors_map.get(cid, {})
        entries.append(
            ConstructorStandingEntry(
                position=row["position"],
                points=float(row["points"]),
                wins=int(row.get("wins") or 0),
                constructor_id=cid,
                constructor_ref=constructor.get("ref", ""),
                name=constructor.get("name", ""),
                nationality=constructor.get("nationality"),
            )
        )
    return entries


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{year}", response_model=StandingsResponse)
def get_standings(
    year: int,
    db: DB,
    type: Annotated[str | None, Query(pattern="^(driver|constructor)$")] = None,
) -> StandingsResponse:
    """Return championship standings for the latest completed round of a season.

    Args:
        year: The F1 season year (e.g. 2024).
        db:   Injected Supabase client.
        type: Optional filter — ``"driver"`` or ``"constructor"``. When omitted
              both tables are returned.

    Raises:
        HTTPException: 404 when no standings data exists for the requested year.
    """
    round_number = _latest_round(db, year)
    if round_number is None:
        raise HTTPException(
            status_code=404, detail=f"No standings data found for season {year}"
        )

    driver_standings: list[DriverStandingEntry] | None = None
    constructor_standings: list[ConstructorStandingEntry] | None = None

    if type is None or type == "driver":
        driver_standings = _fetch_driver_standings(db, year, round_number)

    if type is None or type == "constructor":
        constructor_standings = _fetch_constructor_standings(db, year, round_number)

    return StandingsResponse(
        season=year,
        round=round_number,
        driver_standings=driver_standings,
        constructor_standings=constructor_standings,
    )


def _driver_standings_by_round(
    db: Client, season: int
) -> tuple[dict[int, dict[int, tuple[float, int | None]]], dict[int, int]]:
    """The season's driver standings rows as {round: {driver_id: (points,
    position)}}, and each round's wins added up."""
    rows = fetch_all(
        lambda: db.table("standings")
        .select("id, entity_id, round, points, position, wins")
        .eq("type", "driver")
        .eq("season", season)
        .order("id")
    )
    by_round: dict[int, dict[int, tuple[float, int | None]]] = defaultdict(dict)
    wins: dict[int, int] = defaultdict(int)
    for row in rows:
        by_round[row["round"]][row["entity_id"]] = (
            float(row["points"] or 0),
            row["position"],
        )
        wins[row["round"]] += row.get("wins") or 0
    return by_round, wins


def _standings_hold_results(
    by_round: dict[int, dict[int, tuple[float, int | None]]],
    wins: dict[int, int],
    rounds_with_results: list[int],
) -> bool:
    """Whether every round with results has standings that include its Grand Prix.

    Jolpica's wins count Grand Prix wins only, so the standings after round N
    hold N wins once its Grand Prix is in. Standings stored between a sprint and
    its Grand Prix, and not fetched again since, are one short. Points can't
    tell: earlier sprint points can cover a missing Grand Prix.
    """
    return all(rnd in by_round and wins[rnd] >= rnd for rnd in rounds_with_results)


@router.get("/{year}/progression", response_model=list[DriverPointsProgression])
def get_standings_progression(
    year: int,
    db: DB,
    top: Annotated[int, Query(ge=1, le=20)] = 5,
) -> list[DriverPointsProgression]:
    """Return round-by-round cumulative championship points for the top N drivers.

    When the standings table holds the standings after every round that has
    results (seed_database.py --standings-every-round), each including that
    round's Grand Prix, the points and the top N come from them, sprints
    included. Otherwise they're summed from race_results, which hold Grand Prix
    points only, so sprint points are missing.

    Args:
        year: The F1 season year (e.g. 2024).
        db:   Injected Supabase client.
        top:  Number of drivers to include (by total season points).
              Must be between 1 and 20, defaults to 5.
    """
    # Fetch race IDs for the season, then get all results for those races.
    season_races_result = (
        db.table("races")
        .select("id, round")
        .eq("season", year)
        .order("round")
        .execute()
    )
    season_races = season_races_result.data or []
    if not season_races:
        return []

    season_race_ids = [r["id"] for r in season_races]
    race_id_to_round: dict[int, int] = {r["id"]: r["round"] for r in season_races}

    race_results_data = (
        db.table("race_results")
        .select("driver_id, race_id, points")
        .in_("race_id", season_race_ids)
        .execute()
    )
    season_rows: list[dict] = race_results_data.data or []
    if not season_rows:
        return []

    rounds_with_results = sorted({race_id_to_round[r["race_id"]] for r in season_rows})
    by_round, wins = _driver_standings_by_round(db, year)
    # {driver_id: {round: points after that round}}
    totals_after: dict[int, dict[int, float]] = defaultdict(dict)
    if _standings_hold_results(by_round, wins, rounds_with_results):
        # The standings after each round include sprints. A round stored after
        # its sprint but before its results (a sprint Saturday) isn't charted.
        latest = by_round[rounds_with_results[-1]]
        top_driver_ids = sorted(
            latest,
            key=lambda d: (latest[d][1] is None, latest[d][1] or 0, -latest[d][0]),
        )[:top]
        for rnd in rounds_with_results:
            for did, (points, _) in by_round[rnd].items():
                totals_after[did][rnd] = points
    else:
        # Grand Prix points only: race_results hold no sprint results
        points_by_driver: dict[int, dict[int, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        for row in season_rows:
            did = row["driver_id"]
            rnd = race_id_to_round[row["race_id"]]
            points_by_driver[did][rnd] += float(row.get("points") or 0)
        driver_totals = {
            did: sum(rounds.values()) for did, rounds in points_by_driver.items()
        }
        top_driver_ids = sorted(
            driver_totals, key=lambda d: driver_totals[d], reverse=True
        )[:top]
        for did, rounds in points_by_driver.items():
            running = 0.0
            for rnd in sorted(rounds):
                running += rounds[rnd]
                totals_after[did][rnd] = running

    if not top_driver_ids:
        return []

    # Fetch driver info (ref, surname).
    drivers_result = (
        db.table("drivers")
        .select("id, ref, surname")
        .in_("id", top_driver_ids)
        .execute()
    )
    drivers_map: dict[int, dict] = {
        int(d["id"]): d for d in (drivers_result.data or [])
    }

    # Fetch constructor ref for each driver (season-scoped, reuse season_race_ids).
    constructor_ref_map: dict[int, str] = {}
    if season_race_ids:
        constructor_result = (
            db.table("race_results")
            .select("driver_id, constructors(ref)")
            .in_("driver_id", top_driver_ids)
            .in_("race_id", season_race_ids)
            .execute()
        )
        for rr in constructor_result.data or []:
            did = int(rr["driver_id"])
            c = rr.get("constructors")
            if c and c.get("ref"):
                constructor_ref_map[did] = c["ref"]

    # Build cumulative progression for each top driver.
    result: list[DriverPointsProgression] = []
    for driver_id in top_driver_ids:
        driver_info = drivers_map.get(driver_id, {})
        after = totals_after[driver_id]
        sorted_rounds = sorted(after)
        cumulative = [after[rnd] for rnd in sorted_rounds]

        result.append(
            DriverPointsProgression(
                driver_ref=driver_info.get("ref", ""),
                surname=driver_info.get("surname", ""),
                constructor_ref=constructor_ref_map.get(driver_id, ""),
                rounds=sorted_rounds,
                points=cumulative,
            )
        )

    return result
