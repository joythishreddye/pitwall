"""Seasons router — calendar and season-level race listing."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/seasons", tags=["seasons"])


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


class SeasonSummary(BaseModel):
    year: int
    race_count: int


class CircuitInfo(BaseModel):
    name: str
    location: str
    country: str
    lat: float | None = None
    lng: float | None = None


class WinnerInfo(BaseModel):
    surname: str
    forename: str
    constructor_ref: str
    constructor_name: str


class RaceCalendarEntry(BaseModel):
    id: int
    season: int
    round: int
    name: str
    date: str | None = None
    time: str | None = None
    url: str | None = None
    circuit: CircuitInfo | None = None
    winner: WinnerInfo | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=list[SeasonSummary])
def list_seasons(db: DB) -> list[SeasonSummary]:
    """Return all distinct seasons with the number of races in each.

    Results are ordered by year descending so the most recent season appears
    first.
    """
    result = db.table("races").select("season").execute()
    rows = result.data or []

    counts: dict[int, int] = {}
    for row in rows:
        year = int(row["season"])
        counts[year] = counts.get(year, 0) + 1

    return [
        SeasonSummary(year=year, race_count=count)
        for year, count in sorted(counts.items(), reverse=True)
    ]


@router.get("/{year}/races", response_model=list[RaceCalendarEntry])
def get_season_races(year: int, db: DB) -> list[RaceCalendarEntry]:
    """Return the race calendar for a given season, ordered by round.

    Each entry includes the circuit name, location, and country sourced via
    PostgREST foreign-key embed.

    Args:
        year: The F1 season year (e.g. 2024).
        db:   Injected Supabase client.

    Raises:
        HTTPException: 404 when no races are found for the requested season.
    """
    result = (
        db.table("races")
        .select("*, circuits(name, location, country, lat, lng)")
        .eq("season", year)
        .order("round")
        .execute()
    )
    rows = result.data or []

    if not rows:
        raise HTTPException(status_code=404, detail=f"Season {year} not found")

    entries: list[RaceCalendarEntry] = []
    race_ids: list[int] = []
    for row in rows:
        circuit_data = row.get("circuits")
        circuit = CircuitInfo(**circuit_data) if circuit_data else None
        entries.append(
            RaceCalendarEntry(
                id=row["id"],
                season=row["season"],
                round=row["round"],
                name=row["name"],
                date=row.get("date"),
                time=row.get("time"),
                url=row.get("url"),
                circuit=circuit,
            )
        )
        race_ids.append(row["id"])

    # Fetch P1 results for all races in one indexed query and merge
    if race_ids:
        winners_result = (
            db.table("race_results")
            .select("race_id, drivers(forename, surname), constructors(ref, name)")
            .in_("race_id", race_ids)
            .eq("position", 1)
            .execute()
        )
        winners_by_race: dict[int, WinnerInfo] = {}
        for w in winners_result.data or []:
            driver = w.get("drivers") or {}
            constructor = w.get("constructors") or {}
            if driver and constructor:
                winners_by_race[w["race_id"]] = WinnerInfo(
                    surname=driver.get("surname", ""),
                    forename=driver.get("forename", ""),
                    constructor_ref=constructor.get("ref", ""),
                    constructor_name=constructor.get("name", ""),
                )
        for entry in entries:
            entry.winner = winners_by_race.get(entry.id)

    return entries
