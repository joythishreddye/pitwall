"""Title maths (brief 001, The engineer's briefing).

Points left at most = remaining races x 25 + remaining sprints x 8 (drivers),
and remaining races x 43 + remaining sprints x 15 (constructors). A title is
decided when the lead is bigger than the points left. "Can still finish second"
means within the points left of second place.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

Kind = Literal["driver", "constructor"]

# The most one entry can score: a win, or a team's one-two
_PER_RACE = {"driver": 25, "constructor": 25 + 18}
_PER_SPRINT = {"driver": 8, "constructor": 8 + 7}


@dataclass(frozen=True)
class Standing:
    """One row of the standings. Functions here take them in championship order;
    a tie on points keeps that order (countback decides it)."""

    ref: str
    points: float


def points_left(kind: Kind, races_left: int, sprints_left: int) -> int:
    if races_left < 0 or sprints_left < 0 or sprints_left > races_left:
        raise ValueError(
            f"{races_left} races and {sprints_left} sprints left isn't a season"
        )
    return races_left * _PER_RACE[kind] + sprints_left * _PER_SPRINT[kind]


def _by_points(standings: Sequence[Standing]) -> list[Standing]:
    return sorted(standings, key=lambda s: s.points, reverse=True)


def title_decided(standings: Sequence[Standing], left: int) -> bool:
    """The leader can't be caught: his lead is bigger than the points left."""
    ranked = _by_points(standings)
    if len(ranked) < 2:
        return bool(ranked)
    return ranked[0].points - ranked[1].points > left


def can_finish_second(standings: Sequence[Standing], left: int) -> list[Standing]:
    """Everyone behind the leader within the points left of second place.

    A tie on points is still possible at exactly the points left, so that counts.
    """
    ranked = _by_points(standings)
    if len(ranked) < 2:
        return []
    second = ranked[1].points
    return [s for s in ranked[1:] if second - s.points <= left]
