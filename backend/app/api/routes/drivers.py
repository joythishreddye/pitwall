"""Drivers router — driver profiles and paginated race results."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import Client

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drivers", tags=["drivers"])


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


class CareerStats(BaseModel):
    races: int
    wins: int
    podiums: int
    poles: int
    points: float
    championships: int


class ConstructorBrief(BaseModel):
    id: int
    ref: str
    name: str
    nationality: str | None = None


class DriverProfile(BaseModel):
    id: int
    ref: str
    number: str | None = None
    code: str | None = None
    forename: str
    surname: str
    dob: str | None = None
    nationality: str | None = None
    url: str | None = None
    current_constructor: ConstructorBrief | None = None
    career_stats: CareerStats


class RaceResultEntry(BaseModel):
    race_id: int
    race_name: str
    season: int
    round: int
    date: str | None = None
    constructor_name: str | None = None
    grid: int | None = None
    position: int | None = None
    position_text: str | None = None
    points: float | None = None
    laps: int | None = None
    status: str | None = None
    time_millis: int | None = None
    fastest_lap_rank: int | None = None


class PaginatedDriverResults(BaseModel):
    total: int
    limit: int
    offset: int
    results: list[RaceResultEntry]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_career_stats(
    db: Client, driver_id: int
) -> CareerStats:
    """Aggregate career stats for a driver from race_results and standings.

    Args:
        db:        Supabase client.
        driver_id: Primary key of the driver.

    Returns:
        CareerStats with aggregated wins, podiums, poles, points, and races.
    """
    # Fetch all race results for career totals
    results = (
        db.table("race_results")
        .select("position, points")
        .eq("driver_id", driver_id)
        .execute()
    )
    rows = results.data or []

    total_races = len(rows)
    wins = sum(1 for r in rows if r.get("position") == 1)
    podiums = sum(1 for r in rows if r.get("position") in (1, 2, 3))
    total_points = sum(float(r["points"]) for r in rows if r.get("points") is not None)

    # Poles come from qualifying_results where position = 1
    poles_result = (
        db.table("qualifying_results")
        .select("id", count="exact")
        .eq("driver_id", driver_id)
        .eq("position", 1)
        .execute()
    )
    poles = poles_result.count or 0

    # Championships: driver standing position == 1 at the final round of any season
    # We look at standings where type="driver", position=1, and round is the season max.
    # Strategy: fetch all driver standings at position 1 for this driver then verify
    # it was the final round of its season.
    champ_standings = (
        db.table("standings")
        .select("season, round")
        .eq("entity_id", driver_id)
        .eq("type", "driver")
        .eq("position", 1)
        .execute()
    )
    # Build a map of {season: max_round_where_P1} from the candidate rows
    champ_by_season: dict[int, int] = {}
    for row in champ_standings.data or []:
        s, r = row["season"], row["round"]
        if s not in champ_by_season or r > champ_by_season[s]:
            champ_by_season[s] = r

    # Verify each candidate was actually at the final round of its season.
    # Fetch the max round for each candidate season in one query.
    championships = 0
    if champ_by_season:
        all_seasons = list(champ_by_season.keys())
        final_rounds = (
            db.table("standings")
            .select("season, round")
            .eq("type", "driver")
            .in_("season", all_seasons)
            .order("round", desc=True)
            .execute()
        )
        # Build {season: max_round} from all standings rows
        season_max: dict[int, int] = {}
        for row in final_rounds.data or []:
            s = row["season"]
            if s not in season_max or row["round"] > season_max[s]:
                season_max[s] = row["round"]

        for season, p1_round in champ_by_season.items():
            if season_max.get(season) == p1_round:
                championships += 1

    return CareerStats(
        races=total_races,
        wins=wins,
        podiums=podiums,
        poles=poles,
        points=total_points,
        championships=championships,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{driver_ref}", response_model=DriverProfile)
def get_driver(driver_ref: str, db: DB) -> DriverProfile:
    """Return a driver's profile with aggregated career statistics.

    The ``current_constructor`` is determined by the constructor in the
    driver's most recent race result row.

    Args:
        driver_ref: URL-slug reference for the driver (e.g. ``"verstappen"``).
        db:         Injected Supabase client.

    Raises:
        HTTPException: 404 when no driver with that ref exists.
    """
    driver_result = (
        db.table("drivers")
        .select("*")
        .eq("ref", driver_ref)
        .limit(1)
        .execute()
    )
    drivers = driver_result.data or []
    if not drivers:
        raise HTTPException(
            status_code=404, detail=f"Driver '{driver_ref}' not found"
        )

    driver_row = drivers[0]
    driver_id = driver_row["id"]

    # Current constructor: constructor from latest race result
    latest_result = (
        db.table("race_results")
        .select("constructors(id, ref, name, nationality), races(season, round)")
        .eq("driver_id", driver_id)
        .order("race_id", desc=True)
        .limit(1)
        .execute()
    )
    current_constructor: ConstructorBrief | None = None
    if latest_result.data:
        c = latest_result.data[0].get("constructors")
        if c and c.get("id"):
            current_constructor = ConstructorBrief(
                id=c["id"],
                ref=c["ref"],
                name=c["name"],
                nationality=c.get("nationality"),
            )

    career_stats = _compute_career_stats(db, driver_id)

    raw_number = driver_row.get("number")
    return DriverProfile(
        id=driver_row["id"],
        ref=driver_row["ref"],
        number=str(raw_number) if raw_number is not None else None,
        code=driver_row.get("code"),
        forename=driver_row["forename"],
        surname=driver_row["surname"],
        dob=driver_row.get("dob"),
        nationality=driver_row.get("nationality"),
        url=driver_row.get("url"),
        current_constructor=current_constructor,
        career_stats=career_stats,
    )


@router.get("/{driver_ref}/results", response_model=PaginatedDriverResults)
def get_driver_results(
    driver_ref: str,
    db: DB,
    season: Annotated[int | None, Query(ge=1950, le=2100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginatedDriverResults:
    """Return paginated race results for a driver, optionally filtered by season.

    Args:
        driver_ref: URL-slug reference for the driver (e.g. ``"hamilton"``).
        db:         Injected Supabase client.
        season:     Optional season filter (e.g. ``2024``).
        limit:      Maximum number of results to return (default 50, max 200).
        offset:     Number of results to skip for pagination (default 0).

    Raises:
        HTTPException: 404 when the driver does not exist.
    """
    driver_result = (
        db.table("drivers")
        .select("id")
        .eq("ref", driver_ref)
        .limit(1)
        .execute()
    )
    drivers = driver_result.data or []
    if not drivers:
        raise HTTPException(
            status_code=404, detail=f"Driver '{driver_ref}' not found"
        )
    driver_id = drivers[0]["id"]

    # Fetch race results joined with races and constructors.
    # When a season filter is requested we must fetch all rows for the driver
    # and filter in Python, because supabase-py does not expose PostgREST
    # nested-resource filter syntax (e.g. `races.season=eq.2024`) cleanly.
    # For the unfiltered case we use DB-level pagination for efficiency.
    base_query = (
        db.table("race_results")
        .select(
            "race_id, grid, position, position_text, points, laps, status, "
            "time_millis, fastest_lap_rank, "
            "races(id, name, season, round, date), "
            "constructors(name)"
        )
        .eq("driver_id", driver_id)
        .order("race_id", desc=True)
    )

    if season is not None:
        # Fetch everything and filter/paginate in Python
        all_result = base_query.execute()
        all_rows = [
            r
            for r in (all_result.data or [])
            if (r.get("races") or {}).get("season") == season
        ]
        total = len(all_rows)
        rows = all_rows[offset : offset + limit]
    else:
        # DB-level pagination; count separately
        count_result = (
            db.table("race_results")
            .select("race_id", count="exact")
            .eq("driver_id", driver_id)
            .execute()
        )
        total = count_result.count or 0
        paged_result = base_query.range(offset, offset + limit - 1).execute()
        rows = paged_result.data or []

    entries: list[RaceResultEntry] = []
    for row in rows:
        race = row.get("races") or {}
        constructor = row.get("constructors") or {}
        entries.append(
            RaceResultEntry(
                race_id=row["race_id"],
                race_name=race.get("name", ""),
                season=race.get("season", 0),
                round=race.get("round", 0),
                date=race.get("date"),
                constructor_name=constructor.get("name"),
                grid=row.get("grid"),
                position=row.get("position"),
                position_text=row.get("position_text"),
                points=float(row["points"]) if row.get("points") is not None else None,
                laps=row.get("laps"),
                status=row.get("status"),
                time_millis=row.get("time_millis"),
                fastest_lap_rank=row.get("fastest_lap_rank"),
            )
        )

    return PaginatedDriverResults(
        total=total,
        limit=limit,
        offset=offset,
        results=entries,
    )
