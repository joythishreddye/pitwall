"""Races router — race detail, lap data, and pit-stop strategy."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import Client

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/races", tags=["races"])


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


class CircuitBrief(BaseModel):
    id: int
    name: str
    location: str
    country: str
    lat: float | None = None
    lng: float | None = None


class DriverBrief(BaseModel):
    id: int
    ref: str
    forename: str
    surname: str
    code: str | None = None
    number: str | None = None
    nationality: str | None = None


class ConstructorBrief(BaseModel):
    id: int
    ref: str
    name: str
    nationality: str | None = None


class RaceResult(BaseModel):
    driver: DriverBrief
    constructor: ConstructorBrief
    grid: int | None = None
    position: int | None = None
    position_text: str | None = None
    points: float | None = None
    laps: int | None = None
    status: str | None = None
    time_millis: int | None = None
    fastest_lap_rank: int | None = None


class RaceDetail(BaseModel):
    id: int
    season: int
    round: int
    name: str
    date: str | None = None
    time: str | None = None
    url: str | None = None
    circuit: CircuitBrief | None = None
    results: list[RaceResult] = []


class LapEntry(BaseModel):
    lap_number: int
    position: int | None = None
    time_millis: int | None = None
    sector1_ms: int | None = None
    sector2_ms: int | None = None
    sector3_ms: int | None = None
    compound: str | None = None
    tyre_life: int | None = None
    is_pit_in: bool | None = None
    is_pit_out: bool | None = None


class DriverLapData(BaseModel):
    driver: DriverBrief
    laps: list[LapEntry]


class PitStop(BaseModel):
    stop_number: int
    lap: int | None = None
    duration_ms: int | None = None


class DriverStrategy(BaseModel):
    driver: DriverBrief
    pit_stops: list[PitStop]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _race_exists(db: Client, race_id: int) -> bool:
    """Return True when a race with the given id exists in the database."""
    result = (
        db.table("races").select("id").eq("id", race_id).limit(1).execute()
    )
    return bool(result.data)


def _build_driver_brief(d: dict) -> DriverBrief:
    raw_number = d.get("number")
    return DriverBrief(
        id=d["id"],
        ref=d["ref"],
        forename=d["forename"],
        surname=d["surname"],
        code=d.get("code"),
        number=str(raw_number) if raw_number is not None else None,
        nationality=d.get("nationality"),
    )


def _build_constructor_brief(c: dict) -> ConstructorBrief:
    return ConstructorBrief(
        id=c["id"],
        ref=c["ref"],
        name=c["name"],
        nationality=c.get("nationality"),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{race_id}", response_model=RaceDetail)
def get_race(race_id: int, db: DB) -> RaceDetail:
    """Return race detail including circuit info and finishing results.

    Results are sorted by finishing position (classified finishers first, DNFs
    after, ordered by position_text numerically).

    Args:
        race_id: Primary key of the race row.
        db:      Injected Supabase client.

    Raises:
        HTTPException: 404 when no race with the given id exists.
    """
    race_result = (
        db.table("races")
        .select("*, circuits(id, name, location, country, lat, lng)")
        .eq("id", race_id)
        .limit(1)
        .execute()
    )
    races = race_result.data or []
    if not races:
        raise HTTPException(status_code=404, detail=f"Race {race_id} not found")

    race_row = races[0]
    circuit_data = race_row.get("circuits")
    circuit = CircuitBrief(**circuit_data) if circuit_data else None

    # Fetch results joined with drivers and constructors
    results_result = (
        db.table("race_results")
        .select(
            "*, drivers(id, ref, forename, surname, code, number, nationality), "
            "constructors(id, ref, name, nationality)"
        )
        .eq("race_id", race_id)
        .order("position")
        .execute()
    )
    result_rows = results_result.data or []

    # Separate classified (numeric position) from non-classified, then re-join
    classified = [r for r in result_rows if r.get("position") is not None]
    dnf = [r for r in result_rows if r.get("position") is None]

    race_results: list[RaceResult] = []
    for row in classified + dnf:
        d = row.get("drivers") or {}
        c = row.get("constructors") or {}
        race_results.append(
            RaceResult(
                driver=_build_driver_brief(d) if d.get("id") else DriverBrief(
                    id=0, ref="", forename="Unknown", surname=""
                ),
                constructor=(
                    _build_constructor_brief(c)
                    if c.get("id")
                    else ConstructorBrief(id=0, ref="", name="Unknown")
                ),
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

    return RaceDetail(
        id=race_row["id"],
        season=race_row["season"],
        round=race_row["round"],
        name=race_row["name"],
        date=race_row.get("date"),
        time=race_row.get("time"),
        url=race_row.get("url"),
        circuit=circuit,
        results=race_results,
    )


@router.get("/{race_id}/laps", response_model=list[DriverLapData])
def get_race_laps(
    race_id: int,
    db: DB,
    driver_ref: Annotated[str | None, Query()] = None,
) -> list[DriverLapData]:
    """Return lap-by-lap telemetry for a race, optionally filtered to one driver.

    Args:
        race_id:    Primary key of the race row.
        db:         Injected Supabase client.
        driver_ref: Optional driver reference slug (e.g. ``"verstappen"``). When
                    provided only that driver's laps are returned.

    Raises:
        HTTPException: 404 when the race does not exist.
        HTTPException: 404 when a ``driver_ref`` filter matches no driver.
    """
    if not _race_exists(db, race_id):
        raise HTTPException(status_code=404, detail=f"Race {race_id} not found")

    # Resolve optional driver filter
    driver_id_filter: int | None = None
    if driver_ref is not None:
        dr = (
            db.table("drivers")
            .select("id")
            .eq("ref", driver_ref)
            .limit(1)
            .execute()
        )
        if not dr.data:
            raise HTTPException(
                status_code=404, detail=f"Driver '{driver_ref}' not found"
            )
        driver_id_filter = dr.data[0]["id"]

    # Build lap summaries query
    query = (
        db.table("lap_summaries")
        .select(
            "lap_number, position, time_millis, sector1_ms, sector2_ms, sector3_ms, "
            "compound, tyre_life, is_pit_in, is_pit_out, driver_id, "
            "drivers(id, ref, forename, surname, code, number, nationality)"
        )
        .eq("race_id", race_id)
        .order("driver_id")
        .order("lap_number")
    )
    if driver_id_filter is not None:
        query = query.eq("driver_id", driver_id_filter)

    laps_result = query.execute()
    lap_rows = laps_result.data or []

    # Group by driver
    driver_map: dict[int, dict] = {}
    driver_laps: dict[int, list[LapEntry]] = {}

    for row in lap_rows:
        did = row["driver_id"]
        if did not in driver_map:
            d = row.get("drivers") or {}
            driver_map[did] = d
            driver_laps[did] = []

        driver_laps[did].append(
            LapEntry(
                lap_number=row["lap_number"],
                position=row.get("position"),
                time_millis=row.get("time_millis"),
                sector1_ms=row.get("sector1_ms"),
                sector2_ms=row.get("sector2_ms"),
                sector3_ms=row.get("sector3_ms"),
                compound=row.get("compound"),
                tyre_life=row.get("tyre_life"),
                is_pit_in=row.get("is_pit_in"),
                is_pit_out=row.get("is_pit_out"),
            )
        )

    result: list[DriverLapData] = []
    for did, d in driver_map.items():
        result.append(
            DriverLapData(
                driver=_build_driver_brief(d) if d.get("id") else DriverBrief(
                    id=did, ref="", forename="Unknown", surname=""
                ),
                laps=driver_laps[did],
            )
        )
    return result


@router.get("/{race_id}/strategy", response_model=list[DriverStrategy])
def get_race_strategy(race_id: int, db: DB) -> list[DriverStrategy]:
    """Return pit-stop strategy data for all drivers in a race.

    Args:
        race_id: Primary key of the race row.
        db:      Injected Supabase client.

    Raises:
        HTTPException: 404 when the race does not exist.
    """
    if not _race_exists(db, race_id):
        raise HTTPException(status_code=404, detail=f"Race {race_id} not found")

    pit_result = (
        db.table("pit_stops")
        .select(
            "stop_number, lap, duration_ms, driver_id, "
            "drivers(id, ref, forename, surname, code, number, nationality)"
        )
        .eq("race_id", race_id)
        .order("driver_id")
        .order("stop_number")
        .execute()
    )
    pit_rows = pit_result.data or []

    driver_map: dict[int, dict] = {}
    driver_stops: dict[int, list[PitStop]] = {}

    for row in pit_rows:
        did = row["driver_id"]
        if did not in driver_map:
            d = row.get("drivers") or {}
            driver_map[did] = d
            driver_stops[did] = []

        driver_stops[did].append(
            PitStop(
                stop_number=row["stop_number"],
                lap=row.get("lap"),
                duration_ms=row.get("duration_ms"),
            )
        )

    result: list[DriverStrategy] = []
    for did, d in driver_map.items():
        result.append(
            DriverStrategy(
                driver=_build_driver_brief(d) if d.get("id") else DriverBrief(
                    id=did, ref="", forename="Unknown", surname=""
                ),
                pit_stops=driver_stops[did],
            )
        )
    return result
