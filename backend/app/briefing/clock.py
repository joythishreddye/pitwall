"""Which view the clock picks, and race week's phases (brief 001, The three views).

- After a race: for 72 hours from the scheduled start of the latest race with
  results; at exactly 72 hours the next view takes over.
- Race week: otherwise, for the first race without results, once its season is
  under way (an earlier race of that season has results) or it starts in 14 days
  or less (at exactly 14 days, race week takes over).
- Off-season: otherwise.

A race still without results 3 days after its start is taken as cancelled and
skipped, so a race dropped after the calendar was seeded can't hold the page on
RESULTS SOON for good.

A result counts only once its race has started by the clock, so any clock gives
the view of that moment, even with later results in the data (a test or a
fixture at a past instant).

Every instant is taken in UTC before any sum: Python adds a timedelta to the
wall clock of the instant's own zone, so 72 hours from a London start that
crosses the end of summer time would land an hour late.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum

AFTER_RACE_FOR = timedelta(hours=72)
RACE_WEEK_FROM = timedelta(days=14)
RACE_UNDER_WAY_FOR = timedelta(hours=2, minutes=30)
CANCELLED_AFTER = timedelta(days=3)

# Jolpica gives start times only, so a session ends at its start plus its
# standard length
SESSION_LENGTH = {
    "practice_1": timedelta(hours=1),
    "practice_2": timedelta(hours=1),
    "practice_3": timedelta(hours=1),
    "sprint_qualifying": timedelta(minutes=45),
    "sprint": timedelta(hours=1),
    "qualifying": timedelta(hours=1),
    "race": timedelta(hours=2),
}


class View(StrEnum):
    AFTER_RACE = "after_race"
    RACE_WEEK = "race_week"
    OFF_SEASON = "off_season"


class Phase(StrEnum):
    """Race week's picture: a countdown, then RACE UNDER WAY, then RESULTS SOON."""

    COUNTDOWN = "countdown"
    UNDER_WAY = "under_way"
    RESULTS_SOON = "results_soon"


class SessionState(StrEnum):
    DONE = "done"
    LIVE = "live"
    NEXT = "next"
    LATER = "later"


@dataclass(frozen=True)
class Race:
    season: int
    round: int
    start: datetime  # timezone-aware; kept in UTC
    has_results: bool

    def __post_init__(self) -> None:
        object.__setattr__(self, "start", _utc(self.start))


@dataclass(frozen=True)
class Session:
    name: str  # a SESSION_LENGTH key
    start: datetime | None  # None: a date but no time, so never LIVE; kept in UTC

    def __post_init__(self) -> None:
        if self.name not in SESSION_LENGTH:
            known = ", ".join(SESSION_LENGTH)
            raise ValueError(f"unknown session {self.name!r}; known: {known}")
        if self.start is not None:
            object.__setattr__(self, "start", _utc(self.start))

    @property
    def end(self) -> datetime | None:
        return None if self.start is None else self.start + SESSION_LENGTH[self.name]


@dataclass(frozen=True)
class ViewChoice:
    view: View
    # After a race: that race. Race week: the race ahead. Off-season: None.
    race: Race | None
    phase: Phase | None  # race week only
    # The next instant the clock alone changes the view or the phase; None when
    # only new data can (the off-season with no later race in the data)
    valid_until: datetime | None


def _utc(instant: datetime) -> datetime:
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("times must be timezone-aware")
    return instant.astimezone(UTC)


def _result_in(race: Race, now: datetime) -> bool:
    return race.has_results and race.start <= now


def _cancelled(race: Race, now: datetime) -> bool:
    return not _result_in(race, now) and now >= race.start + CANCELLED_AFTER


def pick_view(now: datetime, races: Iterable[Race]) -> ViewChoice:
    """The view at ``now`` for ``races`` (every season in the data, any order)."""
    now = _utc(now)
    ordered = sorted(races, key=lambda r: (r.start, r.season, r.round))

    with_results = [r for r in ordered if _result_in(r, now)]
    if with_results:
        latest = with_results[-1]
        ends = latest.start + AFTER_RACE_FOR
        if now < ends:
            return ViewChoice(View.AFTER_RACE, latest, None, ends)

    ahead = next(
        (r for r in ordered if not _result_in(r, now) and not _cancelled(r, now)),
        None,
    )
    if ahead is None:
        return ViewChoice(View.OFF_SEASON, None, None, None)

    under_way = any(_result_in(r, now) and r.season == ahead.season for r in ordered)
    race_week_from = ahead.start - RACE_WEEK_FROM
    if not under_way and now < race_week_from:
        return ViewChoice(View.OFF_SEASON, None, None, race_week_from)

    if now < ahead.start:
        return ViewChoice(View.RACE_WEEK, ahead, Phase.COUNTDOWN, ahead.start)
    if now < ahead.start + RACE_UNDER_WAY_FOR:
        until = ahead.start + RACE_UNDER_WAY_FOR
        return ViewChoice(View.RACE_WEEK, ahead, Phase.UNDER_WAY, until)
    # Until the data has the result, or the race is taken as cancelled
    until = ahead.start + CANCELLED_AFTER
    return ViewChoice(View.RACE_WEEK, ahead, Phase.RESULTS_SOON, until)


def session_states(
    now: datetime, sessions: Sequence[Session]
) -> list[tuple[Session, SessionState]]:
    """Each session of the weekend tagged DONE, LIVE, NEXT or LATER.

    ``sessions`` must come in weekend order (practice first, the race last): a
    session with no time is placed by its position. LIVE only between a session's
    start and its scheduled end. NEXT is the first session that hasn't started. A
    session with no time is never LIVE, and is DONE only once a later session has
    started.
    """
    now = _utc(now)
    states: list[tuple[Session, SessionState]] = []
    next_given = False
    for i, session in enumerate(sessions):
        later_started = any(
            s.start is not None and s.start <= now for s in sessions[i + 1 :]
        )
        if session.start is None:
            state = SessionState.DONE if later_started else SessionState.LATER
        elif session.end is not None and now >= session.end:
            state = SessionState.DONE
        elif now >= session.start:
            state = SessionState.LIVE
        else:
            state = SessionState.LATER
        if state is SessionState.LATER and not next_given:
            state, next_given = SessionState.NEXT, True
        states.append((session, state))
    return states


def next_session_change(now: datetime, sessions: Sequence[Session]) -> datetime | None:
    """The next session start or scheduled end after ``now``: the LIVE dot and the
    DONE / NEXT tags change only then."""
    now = _utc(now)
    edges = [
        edge
        for s in sessions
        for edge in (s.start, s.end)
        if edge is not None and edge > now
    ]
    return min(edges, default=None)
