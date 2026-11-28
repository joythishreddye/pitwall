"""The chat's title note: one line saying whether the drivers' title is decided.

The chat's standings context lists the points; this adds the sum a reader asks
about ("Has Antonelli won the title?"), from brief 001's title maths
(app/briefing/title.py) and the season's schedule (app/data/schedule).
"""

from __future__ import annotations

from collections.abc import Sequence, Set

from app.briefing.title import Standing, points_left, title_decided
from app.schedule import RoundSchedule


def _pts(points: float) -> str:
    return "1 point" if points == 1 else f"{points:g} points"


def _count(n: int, word: str) -> str:
    return f"1 {word}" if n == 1 else f"{n} {word}s"


def title_note(
    season: int,
    rnd: int,
    standings: Sequence[tuple[str, float]],
    schedule: Sequence[RoundSchedule],
    done: Set[int],
) -> str | None:
    """Whether the season's drivers' title is decided after round ``rnd``.

    Args:
        season:    The standings' season.
        rnd:       The round the standings are after.
        standings: (name, points) in championship order.
        schedule:  The season's rounds (load_schedule). Races left are the ones
                   not in ``done``.
        done:      The rounds whose Grand Prix the standings include. Standings
                   stored after a round's sprint, before its Grand Prix, carry
                   that round's number; a round without a result (postponed, or
                   not stored yet) counts as left.

    Returns:
        One line, or None without two drivers or a schedule that lists ``rnd``.
    """
    if len(standings) < 2 or not any(r.round == rnd for r in schedule):
        return None
    (leader, first), (second, runner_up) = standings[0], standings[1]
    left = [r for r in schedule if r.round not in done]
    if not left:
        return f"The {season} season is over: {leader} is the {season} World Champion."
    # Round rnd's standings are in, so its sprint has run; any other round left
    # still has its sprint to run
    sprints = sum(1 for r in left if r.sprint and r.round != rnd)
    most = points_left("driver", len(left), sprints)
    sprint_text = _count(sprints, "sprint") if sprints else "no sprints"
    span = (
        f"with {_count(len(left), 'race')} left, where a driver can score at most "
        f"{most} more points in total ({sprint_text})"
    )
    if first == runner_up:
        gap = f"{leader} and {second} are level on {_pts(first)}"
    else:
        gap = f"{leader} leads {second} by {_pts(first - runner_up)}"
    if title_decided([Standing(leader, first), Standing(second, runner_up)], most):
        return (
            f"The {season} drivers' title is decided: {gap} {span}, "
            f"so {leader} is the {season} World Champion."
        )
    return f"The {season} drivers' title is still open: {gap} {span}."
