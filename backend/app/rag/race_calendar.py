"""The race calendar the chat's prompt carries.

Brief 001's TRY ASKING chips ask "When does the race start?", "When's the next
race?" and "When does {next season} start?", and nothing else gives the chat a
date: the knowledge base has race reports only for races already run.

The note names the last race, the current or next weekend with each of its
sessions (a weekend stays current until 2 h 30 after its race starts, when the
homepage's RACE UNDER WAY ends), the race after it, and next season's first
race when the data has it. Weekends go in race order, as the homepage's do.

The session times come from the schedule files the code ships with
(app/schedule.py), and each session is tagged by the homepage's own rules
(app/briefing/clock.py, session_states), so the chat and the page agree on
what's done and what's next. No database read: the note costs no wait and
can't fail with the database.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, date, datetime, time
from functools import cache
from pathlib import Path

from app.briefing.clock import RACE_UNDER_WAY_FOR, SessionState, session_states
from app.briefing.clock import Session as ClockSession
from app.schedule import DATA_DIR, RoundSchedule, Session, load_schedule

logger = logging.getLogger(__name__)

_SESSION_NAMES = {
    "practice_1": "Practice 1",
    "practice_2": "Practice 2",
    "practice_3": "Practice 3",
    "sprint_qualifying": "Sprint qualifying",
    "sprint": "Sprint",
    "qualifying": "Qualifying",
    "race": "Race",
}
_STATE_WORDS = {
    SessionState.DONE: " (done)",
    SessionState.LIVE: " (on now)",
    SessionState.NEXT: " (next)",
    SessionState.LATER: "",
}


def _day(day: date) -> str:
    return f"{day:%a} {day.day} {day:%b %Y}"


def _when(session: Session) -> str:
    if session.start is None:
        return f"{_day(session.date)}, time not set"
    return f"{_day(session.start.date())}, {session.start:%H:%M} UTC"


def _race_start(weekend: RoundSchedule) -> datetime:
    """The race's start; a race with no time counts from its day's start."""
    race = weekend.race
    return race.start or datetime.combine(race.date, time.min, tzinfo=UTC)


def _race_over(weekend: RoundSchedule, now: datetime) -> bool:
    """True once race week's RACE UNDER WAY ends on the homepage, 2 h 30 after
    the start (a race with no time: once its day has passed in UTC)."""
    race = weekend.race
    if race.start is None:
        return race.date < now.date()
    return now >= race.start + RACE_UNDER_WAY_FOR


def calendar_note(now: datetime, rounds: Sequence[RoundSchedule]) -> str | None:
    """The calendar lines at ``now`` (timezone-aware) for ``rounds``, any
    seasons in any order, or None when there are no rounds."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    now = now.astimezone(UTC)
    # By race start, as the homepage's clock orders races (a round postponed
    # past the next one keeps its number)
    ordered = sorted(rounds, key=lambda r: (_race_start(r), r.season, r.round))
    if not ordered:
        return None
    per_season: dict[int, int] = {}
    for weekend in ordered:
        per_season[weekend.season] = per_season.get(weekend.season, 0) + 1

    def title(weekend: RoundSchedule) -> str:
        count = per_season[weekend.season]
        return (
            f"{weekend.race_name} ({weekend.season}, round {weekend.round} of {count})"
        )

    lines = [f"Now: {_day(now.date())}, {now:%H:%M} UTC. All times are UTC."]
    over = [r for r in ordered if _race_over(r, now)]
    ahead = [r for r in ordered if not _race_over(r, now)]
    if over:
        last = over[-1]
        lines.append(f"Last race: {title(last)}, {_when(last.race)}.")
    if not ahead:
        lines.append("No later race is in PitWall's schedule yet.")
        return "\n".join(lines)

    weekend = ahead[0]
    states = session_states(
        now, [ClockSession(s.name, s.start) for s in weekend.sessions]
    )
    # A session with no time gets no tag: the clock can't place it in its day
    started = any(
        state in (SessionState.DONE, SessionState.LIVE)
        if session.start is not None
        else session.date < now.date()
        for session, (_clock, state) in zip(weekend.sessions, states, strict=True)
    )
    sprint = ", a sprint weekend" if weekend.sprint else ""
    lines.append(
        f"{'This' if started else 'Next'} race weekend: {title(weekend)}{sprint}:"
    )
    for session, (_clock, state) in zip(weekend.sessions, states, strict=True):
        name = _SESSION_NAMES.get(session.name, session.name)
        tag = _STATE_WORDS[state] if session.start is not None else ""
        lines.append(f"- {name}: {_when(session)}{tag}")
    if len(ahead) > 1:
        after = ahead[1]
        lines.append(f"After that: {title(after)}, race {_when(after.race)}.")
    else:
        lines.append("No race after it is in PitWall's schedule yet.")
    # "When does {next season} start?" can come mid-season too
    opener = next((r for r in ahead[2:] if r.season > weekend.season), None)
    if opener is not None and ahead[1].season == weekend.season:
        lines.append(
            f"Next season's first race: {title(opener)}, race {_when(opener.race)}."
        )
    return "\n".join(lines)


@cache
def _season(season: int, data_dir: Path) -> tuple[RoundSchedule, ...]:
    """One season's rounds. The files ship with the code, so each is read once
    per process, and one that can't be read is logged once and left out."""
    try:
        return tuple(load_schedule(season, data_dir))
    except Exception:
        logger.warning(
            "The %s schedule file can't be read; the chat's calendar goes without it",
            season,
            exc_info=True,
        )
        return ()


def race_calendar_note(
    now: datetime | None = None, data_dir: Path = DATA_DIR
) -> str | None:
    """The calendar note for the chat's prompt, from last season's, this
    season's and next season's files; None when none is there or one can't be
    read (the chat then answers without it)."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    try:
        rounds = [
            weekend
            for season in (now.year - 1, now.year, now.year + 1)
            for weekend in _season(season, data_dir)
        ]
        return calendar_note(now, rounds)
    except Exception:
        logger.exception("Race calendar unavailable; answering without it")
        return None
