"""The engineer's briefing: each view's lines and chips (brief 001).

Built by rules from a snapshot of the season's data, with no LLM call on page
load. Each call is at most 52 characters, so it fits one line of the 520 px
column at 1440. Each has shorter fallbacks, and the first that fits wins; when
none fits, that's a bug here, so it raises rather than cutting a line off.

The engineer says only what the data shows: a result line uses the finish order
and the grid, and the points a driver scored in a race come only from that
race's own results (a sprint's points aren't counted in them).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.briefing.clock import Session, View
from app.briefing.title import (
    Standing,
    can_finish_second,
    points_left,
    title_decided,
)

CALL_MAX = 52

INTRO = (
    "Radio check. I'm your AI race engineer: here's where Formula 1 stands right "
    "now. Tap a line for details, or ask me anything."
)

_WEEKDAYS = tuple("Mon Tue Wed Thu Fri Sat Sun".split())
_MONTHS = tuple("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())
_NUM_WORDS = tuple("no one two three four five six seven eight nine ten".split())
_SESSION_NAMES = {
    "practice_1": "Practice 1",
    "practice_2": "Practice 2",
    "practice_3": "Practice 3",
    "sprint_qualifying": "Sprint qualifying",
    "sprint": "The sprint",
}


# ── The snapshot: what the endpoint loads, shaped like the mockup's data ──


def _utc(instant: datetime) -> datetime:
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("times must be timezone-aware")
    return instant.astimezone(UTC)


@dataclass(frozen=True)
class Driver:
    """A row of the drivers' standings."""

    code: str
    last: str
    team: str
    points: float
    wins: int


@dataclass(frozen=True)
class Team:
    """A row of the constructors' standings."""

    name: str
    team_id: str
    points: float


@dataclass(frozen=True)
class RaceInfo:
    season: int
    round: int
    name: str  # "Qatar Grand Prix"
    start: datetime  # timezone-aware; kept in UTC
    sprint: bool = False
    circuit: str = ""  # "Lusail International Circuit"
    locality: str = ""  # "Lusail"
    sessions: tuple[Session, ...] = ()
    # The sprint already has results: between a sprint and its Grand Prix,
    # only the Grand Prix's points are still to win
    sprint_run: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "start", _utc(self.start))


@dataclass(frozen=True)
class Placed:
    """A podium finisher and the slot they started from (0: the pit lane)."""

    code: str
    last: str
    team: str
    grid: int


@dataclass(frozen=True)
class LastYear:
    """Last season's race at this weekend's circuit."""

    year: int
    round: int
    podium: tuple[Placed, Placed, Placed]
    # Who started from pole (grid 1), by surname; the detail says "started on
    # pole", so not qualifying's fastest when a grid penalty moved them back
    pole: str | None


@dataclass(frozen=True)
class LatestRace:
    """The race the after-race view is about."""

    race: RaceInfo
    podium: tuple[Placed, Placed, Placed]
    # Points each driver scored in this race, by driver code, from the race's
    # own results (no sprint points); None when the data has none
    points_this_round: Mapping[str, float] | None = None
    # A question about the race's biggest moment, when the data has one
    biggest_moment: str | None = None


@dataclass(frozen=True)
class Reigning:
    """Last season's champions, for race week before a season's first result."""

    season: int
    champion: Driver
    team: Team


@dataclass(frozen=True)
class Snapshot:
    season: int
    after_round: int  # 0 before the season's first result
    rounds: int  # the season's total
    standings: tuple[Driver, ...]  # championship order
    constructors: tuple[Team, ...]  # championship order
    remaining: tuple[RaceInfo, ...]  # this season's races still to run, in order
    next_race: RaceInfo | None = None  # the next race in the data, any season
    last_year: LastYear | None = None  # race week
    latest: LatestRace | None = None  # after a race
    reigning: Reigning | None = None  # race week before the first result


# ── What the page renders ──


@dataclass(frozen=True)
class Line:
    tag: str
    call: str  # at most CALL_MAX characters
    detail: str
    drivers: tuple[str, ...] = ()  # up to two codes, for the faces
    icon: str | None = None  # flag, calendar, shield or history
    team_id: str | None = None  # the icon tile's colour


@dataclass(frozen=True)
class Briefing:
    view: View
    zone: str  # the zone the times are in
    lines: tuple[Line, ...]
    chips: tuple[str, ...]


# ── Wording helpers ──


def fit_call(*variants: str) -> str:
    """The first variant that fits CALL_MAX characters."""
    for variant in variants:
        if variant and len(variant) <= CALL_MAX:
            return variant
    raise ValueError(f"no call fits {CALL_MAX} characters: {variants!r}")


def reader_zone(name: str | None) -> tzinfo:
    """The reader's zone, or UTC for an empty, unknown or path-like name."""
    key = (name or "").strip()
    if not key or key.startswith("/") or ".." in key.split("/"):
        return UTC
    try:
        return ZoneInfo(key)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return UTC


def _zone_key(zone: tzinfo) -> str:
    return zone.key if isinstance(zone, ZoneInfo) else "UTC"


def _local(instant: datetime, zone: tzinfo) -> datetime:
    return _utc(instant).astimezone(zone)


def day(instant: datetime, zone: tzinfo) -> str:
    """'Sun 29 Nov' in the reader's zone."""
    t = _local(instant, zone)
    return f"{_WEEKDAYS[t.weekday()]} {t.day} {_MONTHS[t.month - 1]}"


def when(instant: datetime, zone: tzinfo) -> str:
    """'Sun 29 Nov, 8:00 am PST' in the reader's zone, with its abbreviation."""
    t = _local(instant, zone)
    hour = t.hour % 12 or 12
    half = "am" if t.hour < 12 else "pm"
    return f"{day(instant, zone)}, {hour}:{t.minute:02d} {half} {t.tzname()}"


def _pts(points: float) -> str:
    return str(int(points)) if float(points).is_integer() else f"{points:g}"


def _count(n: float, word: str) -> str:
    """The count and its word, singular only for exactly one: "1 win", "2 wins"."""
    return f"{_pts(n)} {word}{'' if n == 1 else 's'}"


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _from_grid(grid: int) -> str:
    if grid == 1:
        return "pole"
    if grid <= 0:
        return "the pit lane"
    return f"{_ordinal(grid)} on the grid"


def _word(n: int) -> str:
    return _NUM_WORDS[n] if 0 <= n < len(_NUM_WORDS) else str(n)


def _join(items: Sequence[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _where(race: RaceInfo) -> str:
    """Where a race is, for a call: its town, else its full name. Never the name
    cut down, since "British" or "Australian" isn't a place."""
    return race.locality or race.name


def _in(race: RaceInfo) -> str:
    """'in Silverstone', or 'at the British Grand Prix' when there's no town."""
    return f"in {race.locality}" if race.locality else f"at the {race.name}"


# ── The facts every view reads ──


@dataclass(frozen=True)
class _Facts:
    races_left: int
    sprints_left: int
    left: int
    cons_left: int
    leader: Driver | None
    lead: float
    level: bool  # the top two are level on points
    decided: bool
    second_fight: tuple[Driver, ...]
    cons_lead: float
    cons_decided: bool
    cons_second_fight: tuple[Team, ...]


def _facts(s: Snapshot) -> _Facts:
    races = len(s.remaining)
    sprints = sum(1 for r in s.remaining if r.sprint and not r.sprint_run)
    left = points_left("driver", races, sprints)
    cons_left = points_left("constructor", races, sprints)

    drivers = [Standing(d.code, d.points) for d in s.standings]
    teams = [Standing(t.team_id, t.points) for t in s.constructors]
    by_code = {d.code: d for d in s.standings}
    by_team = {t.team_id: t for t in s.constructors}
    st = s.standings
    cs = s.constructors

    return _Facts(
        races_left=races,
        sprints_left=sprints,
        left=left,
        cons_left=cons_left,
        leader=st[0] if st else None,
        lead=st[0].points - st[1].points if len(st) > 1 else 0,
        level=len(st) > 1 and st[0].points == st[1].points,
        # With nothing left to run, the final order names the champions, even
        # level on points (a tie goes on countback, and the order has it)
        decided=bool(st)
        and (races == 0 or (len(st) > 1 and title_decided(drivers, left))),
        second_fight=tuple(by_code[x.ref] for x in can_finish_second(drivers, left)),
        cons_lead=cs[0].points - cs[1].points if len(cs) > 1 else 0,
        cons_decided=bool(cs)
        and (races == 0 or (len(cs) > 1 and title_decided(teams, cons_left))),
        cons_second_fight=tuple(
            by_team[x.ref] for x in can_finish_second(teams, cons_left)
        ),
    )


def _races_left_text(f: _Facts) -> str:
    n = f.races_left
    return "One race is" if n == 1 else f"{_word(n).capitalize()} races are"


def _title_why(f: _Facts) -> str:
    if f.races_left == 0:
        return "That was the season's last race."
    no_sprints = "" if f.sprints_left else " with no sprints"
    return (
        f"{_races_left_text(f)} left, worth {f.left} points at most{no_sprints}, "
        "so the lead can't be caught."
    )


def _others(drivers: Sequence[Driver]) -> str:
    parts = [
        f"{d.last}{' has' if i == 0 else ''} {_pts(d.points)}"
        for i, d in enumerate(drivers)
    ]
    return _join(parts) + "."


def _champion_call(f: _Facts, leader: Driver) -> str:
    last = leader.last
    if f.level:
        first = f"{last} is champion, level on points."
    elif f.lead:
        first = f"{last} is champion: {_count(f.lead, 'point')} clear."
    else:
        # The only driver in the standings: clear of nobody
        first = f"{last} is the champion."
    return fit_call(
        first,
        f"{last} is the champion.",
        f"Champion: {last}.",
    )


def _level_call(a: Driver, b: Driver, left: int) -> str:
    return fit_call(
        f"{a.last} and {b.last} level on points, {left} left.",
        f"{a.last} and {b.last} are level on points.",
        "Level on points at the top.",
    )


def _run_up(nx: RaceInfo, zone: tzinfo) -> str:
    """The circuit, the first session, qualifying and lights out."""
    parts = [f"The {nx.circuit}." if nx.circuit else ""]
    timed = [x for x in nx.sessions if x.start is not None]
    first = next((x for x in timed if x.name in _SESSION_NAMES), None)
    quali = next((x for x in timed if x.name == "qualifying"), None)
    clauses = []
    if first is not None and first.start is not None:
        clauses.append(f"{_SESSION_NAMES[first.name]} is {when(first.start, zone)}")
    if quali is not None and quali.start is not None:
        clauses.append(f"qualifying {when(quali.start, zone)}")
    clauses.append(f"lights out {when(nx.start, zone)}")
    run = "; ".join(clauses)
    parts.append(run[0].upper() + run[1:] + ".")
    return " ".join(p for p in parts if p)


# ── The three views ──


def _race_week(s: Snapshot, f: _Facts, zone: tzinfo) -> tuple[list[Line], list[str]]:
    nx = s.next_race
    if nx is None:
        raise ValueError("race week needs the race ahead")
    lines = [
        Line(
            "RACE WEEK",
            fit_call(
                f"Race week: {_where(nx)}, round {nx.round} of {s.rounds}.",
                f"Race week: {_where(nx)}.",
                "It's race week.",
            ),
            _run_up(nx, zone),
            icon="flag",
        )
    ]
    reigning = s.reigning if not s.standings else None

    if reigning is not None:
        champ, team, prev = reigning.champion, reigning.team, reigning.season
        lines.append(
            Line(
                "TITLE",
                fit_call(
                    f"{champ.last} is the reigning champion.",
                    f"Reigning champion: {champ.last}.",
                ),
                f"{champ.last} won the {prev} title with "
                f"{_count(champ.points, 'point')} and {_count(champ.wins, 'win')}. "
                f"No {s.season} race has a result yet.",
                drivers=(champ.code,),
            )
        )
        lines.append(
            Line(
                "TEAMS",
                fit_call(
                    f"{team.name} are the reigning team champions.",
                    f"Reigning team champions: {team.name}.",
                    f"Team champions: {team.name}.",
                ),
                f"{team.name} won the {prev} constructors' title with "
                f"{_count(team.points, 'point')}.",
                icon="shield",
                team_id=team.team_id,
            )
        )
    elif f.leader is not None:
        leader = f.leader
        if f.decided:
            lines.append(
                Line(
                    "TITLE",
                    _champion_call(f, leader),
                    f"{_title_why(f)} {leader.last} has "
                    f"{_count(leader.wins, 'win')} this year.",
                    drivers=(leader.code,),
                )
            )
        else:
            lines.append(
                Line(
                    "TITLE",
                    _level_call(leader, s.standings[1], f.left)
                    if f.level
                    else fit_call(f"Title leader: {leader.last}.")
                    if len(s.standings) == 1
                    else fit_call(
                        f"{leader.last} leads by {_pts(f.lead)}, with {f.left} left.",
                        f"{leader.last} leads the title fight.",
                        f"Title leader: {leader.last}.",
                    ),
                    f"{leader.last} has {_count(leader.points, 'point')} and "
                    f"{_count(leader.wins, 'win')}.",
                    drivers=(leader.code,),
                )
            )
        # Second place is a fight only once the title is decided: while it's
        # open, the drivers behind can still win it and the leader can still
        # finish second
        fight = f.second_fight
        if f.decided and len(fight) >= 2:
            a, b = fight[0], fight[1]
            others = _others(fight[2:]) + " " if len(fight) > 2 else ""
            can = "both" if len(fight) == 2 else f"all {_word(len(fight))}"
            lines.append(
                Line(
                    "SECOND PLACE",
                    fit_call(
                        f"Second is open: {a.last} {_pts(a.points)}, "
                        f"{b.last} {_pts(b.points)}.",
                        "Second place is open.",
                    ),
                    f"{others}With {f.left} points left, {can} can still finish "
                    "second.",
                    drivers=(a.code, b.code),
                )
            )
        cs = s.constructors
        if len(cs) >= 2 and f.cons_decided:
            top = cs[0]
            board = _join([f"{t.name} {_pts(t.points)}" for t in cs[:4]])
            chase = f.cons_second_fight
            every = "both" if len(chase) == 2 else "all"
            tail = (
                f"; {_join([t.name for t in chase])} can {every} still finish second."
                if len(chase) > 1
                else "."
            )
            lines.append(
                Line(
                    "TEAMS",
                    fit_call(
                        f"{top.name} have the teams' title: {_pts(f.cons_lead)} clear.",
                        f"{top.name} have the teams' title.",
                        f"Teams' title: {top.name}.",
                    ),
                    f"Constructors' points: {board}. With {f.cons_left} left at most, "
                    f"{top.name} can't be caught{tail}",
                    icon="shield",
                    team_id=top.team_id,
                )
            )

    ly = s.last_year
    if ly is not None:
        w, p2, p3 = ly.podium
        start = _from_grid(w.grid)
        pole = f" {ly.pole} started on pole." if ly.pole and w.grid != 1 else ""
        lines.append(
            Line(
                "LAST YEAR",
                fit_call(
                    f"Last year here: {w.last} won from {start}.",
                    f"Last year here: {w.last} won from {_ordinal(w.grid)}."
                    if w.grid > 1
                    else "",
                    f"Last year here: {w.last} won.",
                ),
                f"{_where(nx)} {ly.year}, round {ly.round}: {w.last} won from "
                f"{start}, with {p2.last} second and {p3.last} third.{pole}",
                drivers=(w.code,),
                icon="history",
            )
        )

    if reigning is not None:
        chips = [
            "When does the race start?",
            f"How did {reigning.champion.last} win the {reigning.season} title?",
            "Who won the teams' title?",
            "Who won here last year?",
        ]
    else:
        leader_name = f.leader.last if f.leader else "the leader"
        chips = [
            "When does the race start?",
            f"Can anyone catch {leader_name}?",
            "Who's fighting for second?",
            "Who won here last year?",
        ]
    return lines, chips


def _after_race(s: Snapshot, f: _Facts, zone: tzinfo) -> tuple[list[Line], list[str]]:
    latest = s.latest
    if latest is None:
        raise ValueError("the after-race view needs its race")
    race = latest.race
    at = _in(race)
    w, p2, p3 = latest.podium
    lines = [
        Line(
            "RESULT",
            fit_call(
                f"{w.last} won {at}, from {_from_grid(w.grid)}.",
                f"{w.last} won {at}.",
                f"{w.last} won.",
            ),
            f"{w.last} won the {race.name} for {w.team}, from {_from_grid(w.grid)}.",
            drivers=(w.code,),
        )
    ]

    standing = {d.code: i for i, d in enumerate(s.standings)}
    in_second = standing.get(p2.code) == 1 and len(s.standings) > 2
    championship = ""
    if in_second:
        gap = s.standings[1].points - s.standings[2].points
        third = s.standings[2].last
        championship = (
            f" {p2.last} is second in the championship, level on points with {third}."
            if gap == 0
            else f" {p2.last} is second in the championship, "
            f"{_count(gap, 'point')} ahead of "
            f"{third}."
        )
    lines.append(
        Line(
            "RESULT",
            fit_call(
                f"{p2.last} second, from {_from_grid(p2.grid)}.", f"{p2.last} second."
            ),
            f"{p2.last} finished second for {p2.team}, from {_from_grid(p2.grid)}."
            + championship,
            drivers=(p2.code,),
        )
    )

    pair = p3.team if p3.team in (w.team, p2.team) else ""
    lines.append(
        Line(
            "RESULT",
            fit_call(
                f"{p3.last} third: two {pair} cars on the podium." if pair else "",
                f"{p3.last} third, from {_from_grid(p3.grid)}.",
                f"{p3.last} third.",
            ),
            f"{p3.last} finished third for {p3.team}, from {_from_grid(p3.grid)}.",
            drivers=(p3.code,),
        )
    )

    if f.decided and f.leader is not None:
        leader = f.leader
        scored = (latest.points_this_round or {}).get(leader.code)
        scored_text = (
            f"{leader.last} scored {_count(scored, 'point')} {at} "
            f"and has {_pts(leader.points)}. "
            if scored is not None
            else ""
        )
        lines.append(
            Line(
                "TITLE",
                _champion_call(f, leader),
                scored_text + _title_why(f),
                drivers=(leader.code,),
            )
        )

    nx = s.next_race
    if nx is None:
        coming = s.season + 1
        lines.append(
            Line(
                "NEXT RACE",
                fit_call(f"No {coming} dates yet.", "No dates yet."),
                f"There's no {coming} calendar in the data yet. When it's out, this "
                "line shows round 1.",
                icon="calendar",
            )
        )
    else:
        of = (
            f"Round {nx.round} of {s.rounds}"
            if nx.season == s.season
            else f"Round {nx.round} of the {nx.season} season"
        )
        circuit = f", at the {nx.circuit}." if nx.circuit else "."
        later = [r for r in s.remaining if r.season == nx.season and r.round > nx.round]
        # The next two by name, then a count, so the detail stays short early on
        items = [f"{_where(r)} on {day(r.start, zone)}" for r in later[:2]]
        if len(later) > 2:
            items.append(f"{len(later) - 2} more")
        then = f" Then {_join(items)}." if items else ""
        where = _where(nx)
        lines.append(
            Line(
                "NEXT RACE",
                fit_call(
                    f"Next: {where}, {when(nx.start, zone)}.",
                    f"Next: {where}, {day(nx.start, zone)}.",
                    f"Next: {where}.",
                ),
                # The start time stays in the detail, since a long place name
                # can push it out of the call
                f"{of}{circuit} Lights out {when(nx.start, zone)}.{then}",
                icon="calendar",
            )
        )

    chips = [
        f"Who won {at}?",
        f"How did {p2.last} get to second?",
        latest.biggest_moment or "Who gained the most places?",
        "When's the next race?",
    ]
    return lines, chips


def _off_season(s: Snapshot, f: _Facts, zone: tzinfo) -> tuple[list[Line], list[str]]:
    lines: list[Line] = []
    leader = f.leader
    st = s.standings
    if leader is not None:
        clear = ""
        if len(st) > 1:
            clear = (
                f", level on points with {st[1].last}"
                if f.lead == 0
                else f", {_pts(f.lead)} clear of {st[1].last}"
            )
        lines.append(
            Line(
                "CHAMPION",
                fit_call(
                    f"{leader.last} is the {s.season} champion.",
                    f"{leader.last} is champion.",
                    f"Champion: {leader.last}.",
                ),
                f"{leader.last} has {_count(leader.wins, 'win')} and "
                f"{_count(leader.points, 'point')} after round {s.after_round}{clear}.",
                drivers=(leader.code,),
            )
        )
    if len(st) >= 2:
        a = st[1]
        b = st[2] if len(st) > 2 else None
        lines.append(
            Line(
                "SECOND PLACE",
                fit_call(
                    ""
                    if b is None
                    else f"{a.last} is second, level on points with {b.last}."
                    if a.points == b.points
                    else f"{a.last} is second, {_pts(a.points - b.points)} ahead of "
                    f"{b.last}.",
                    f"{a.last} is second.",
                    f"Second: {a.last}.",
                ),
                _others(st[1:4]),
                drivers=(a.code, b.code) if b else (a.code,),
            )
        )
    cs = s.constructors
    if len(cs) >= 2 and f.cons_decided:
        top = cs[0]
        lines.append(
            Line(
                "TEAMS",
                fit_call(
                    f"{top.name} won the teams' title: {_count(top.points, 'point')}.",
                    f"{top.name} won the teams' title.",
                    f"Teams' title: {top.name}.",
                ),
                _join(
                    [
                        f"{t.name}{' have' if i == 0 else ''} {_pts(t.points)}"
                        for i, t in enumerate(cs[1:4])
                    ]
                )
                + f", after round {s.after_round}.",
                icon="shield",
                team_id=top.team_id,
            )
        )

    coming = s.season + 1
    opener = s.next_race if s.next_race and s.next_race.season > s.season else None
    if opener is None:
        lines.append(
            Line(
                "NEXT SEASON",
                fit_call(
                    f"No {coming} dates yet. I'll brief you when there are.",
                    f"No {coming} dates yet.",
                ),
                f"There's no {coming} calendar in the data yet. When it's out, this "
                "briefing switches to round 1.",
                icon="calendar",
            )
        )
    else:
        circuit = f", at the {opener.circuit}" if opener.circuit else ""
        lines.append(
            Line(
                "NEXT SEASON",
                fit_call(
                    f"{opener.season} starts {day(opener.start, zone)} {_in(opener)}.",
                    f"{opener.season} starts {day(opener.start, zone)}.",
                ),
                f"Round {opener.round} is the {opener.name}{circuit}: lights out "
                f"{when(opener.start, zone)}.",
                icon="calendar",
            )
        )

    champion = leader.last if leader else "the champion"
    chips = [
        f"How did {champion} win it?",
        "Who's second overall?",
        "Who won the teams' title?",
        f"When does {coming} start?",
    ]
    return lines, chips


def build_briefing(view: View | str, snapshot: Snapshot, zone: str | None) -> Briefing:
    """The lines and chips for ``view``, with times in the reader's ``zone``.

    ``view`` may come as its plain value ("race_week"); an unknown one raises
    ValueError rather than falling through to the off-season.
    """
    view = View(view)
    nx = snapshot.next_race
    if view is View.RACE_WEEK and nx is not None and nx.season != snapshot.season:
        # Race week counts rounds and the title in the race's own season: before
        # its first result that's empty standings and last season's champions
        raise ValueError(
            f"race week for a {nx.season} race needs the {nx.season} snapshot, "
            f"not {snapshot.season}'s"
        )
    latest = snapshot.latest
    if view is View.AFTER_RACE:
        if latest is not None and latest.race.season != snapshot.season:
            raise ValueError(
                f"after a {latest.race.season} race the {latest.race.season} "
                f"snapshot is needed, not {snapshot.season}'s"
            )
        if nx is None and snapshot.remaining:
            # "No 2027 dates yet" with this season's races still to run
            raise ValueError("races are left to run but the next race is missing")
    if view is View.OFF_SEASON and nx is not None and nx.season <= snapshot.season:
        # The off-season's next race opens the next season; otherwise the
        # snapshot is the new season's, with no champion to show
        raise ValueError(
            f"the off-season after {snapshot.season} needs a later season's race, "
            f"not {nx.season}'s"
        )
    tz = reader_zone(zone)
    facts = _facts(snapshot)
    if view is View.RACE_WEEK:
        lines, chips = _race_week(snapshot, facts, tz)
    elif view is View.AFTER_RACE:
        lines, chips = _after_race(snapshot, facts, tz)
    else:
        # The off-season comes only once every race of the season has run or
        # been taken as cancelled (part 1's pick_view), so none is left to count
        done = _facts(replace(snapshot, remaining=()))
        lines, chips = _off_season(snapshot, done, tz)
    return Briefing(view, _zone_key(tz), tuple(lines), tuple(chips))
