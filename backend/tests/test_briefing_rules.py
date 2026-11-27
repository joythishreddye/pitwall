"""The briefing's view, phases, session tags and title maths, on a fixed clock."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.briefing.clock import (
    Phase,
    Race,
    Session,
    SessionState,
    View,
    next_session_change,
    pick_view,
    session_states,
)
from app.briefing.title import (
    Standing,
    can_finish_second,
    points_left,
    title_decided,
)


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


# The brief's race starts (001, The three views), plus rounds 1 to 19 a week apart
BRAZIL = _utc("2026-11-08T17:00Z")
VEGAS = _utc("2026-11-22T04:00Z")
QATAR = _utc("2026-11-29T16:00Z")
ABU_DHABI = _utc("2026-12-06T13:00Z")
OPENER_2027 = _utc("2027-03-07T04:00Z")
STARTS_2026 = [BRAZIL - timedelta(weeks=20 - rnd) for rnd in range(1, 20)] + [
    BRAZIL,
    VEGAS,
    QATAR,
    ABU_DHABI,
]


def _season(results_through: int, with_2027: bool = False) -> list[Race]:
    races = [
        Race(2026, rnd, start, has_results=rnd <= results_through)
        for rnd, start in enumerate(STARTS_2026, start=1)
    ]
    if with_2027:
        races.append(Race(2027, 1, OPENER_2027, has_results=False))
    return races


# The brief's fixed-clock table, row by row
@pytest.mark.parametrize(
    ("clock", "results_through", "with_2027", "view", "round_", "phase"),
    [
        ("2026-11-24T19:00Z", 21, False, View.AFTER_RACE, 21, None),
        ("2026-11-25T19:00Z", 21, False, View.RACE_WEEK, 22, Phase.COUNTDOWN),
        ("2026-11-24T19:00Z", 20, False, View.RACE_WEEK, 21, Phase.RESULTS_SOON),
        ("2026-11-29T20:00Z", 22, False, View.AFTER_RACE, 22, None),
        ("2026-12-02T16:00Z", 22, False, View.RACE_WEEK, 23, Phase.COUNTDOWN),
        ("2026-12-06T18:00Z", 23, False, View.AFTER_RACE, 23, None),
        ("2026-12-09T13:00Z", 23, False, View.OFF_SEASON, None, None),
        ("2027-02-20T04:00Z", 23, True, View.OFF_SEASON, None, None),
        ("2027-02-22T04:00Z", 23, True, View.RACE_WEEK, 1, Phase.COUNTDOWN),
    ],
)
def test_the_brief_fixed_clock_table(
    clock: str,
    results_through: int,
    with_2027: bool,
    view: View,
    round_: int | None,
    phase: Phase | None,
) -> None:
    choice = pick_view(_utc(clock), _season(results_through, with_2027))

    assert choice.view is view
    assert (choice.race.round if choice.race else None) == round_
    assert choice.phase is phase


def test_the_table_countdowns_and_when_each_view_ends() -> None:
    qatar_week = pick_view(_utc("2026-11-25T19:00Z"), _season(21))
    assert qatar_week.race.start - _utc("2026-11-25T19:00Z") == timedelta(
        days=3, hours=21
    )
    assert qatar_week.valid_until == QATAR

    # "after a race, Las Vegas (until 2026-11-25T04:00Z)"
    vegas_after = pick_view(_utc("2026-11-24T19:00Z"), _season(21))
    assert vegas_after.valid_until == _utc("2026-11-25T04:00Z")

    clock = _utc("2027-02-22T04:00Z")
    opener = pick_view(clock, _season(23, with_2027=True))
    assert opener.race.start - clock == timedelta(days=13)

    # Off-season until 14 days before the opener, then race week
    waiting = pick_view(_utc("2027-02-20T04:00Z"), _season(23, with_2027=True))
    assert waiting.valid_until == OPENER_2027 - timedelta(days=14)
    assert pick_view(_utc("2026-12-09T13:00Z"), _season(23)).valid_until is None


def test_at_exactly_72_hours_and_14_days_the_next_view_takes_over() -> None:
    just_before = pick_view(QATAR + timedelta(hours=72, seconds=-1), _season(22))
    assert just_before.view is View.AFTER_RACE
    at_72 = pick_view(QATAR + timedelta(hours=72), _season(22))
    assert (at_72.view, at_72.race.round) == (View.RACE_WEEK, 23)

    season = _season(23, with_2027=True)
    at_14_days = pick_view(OPENER_2027 - timedelta(days=14), season)
    assert at_14_days.view is View.RACE_WEEK
    a_second_earlier = OPENER_2027 - timedelta(days=14, seconds=1)
    assert pick_view(a_second_earlier, season).view is View.OFF_SEASON


def test_race_week_runs_countdown_then_under_way_then_results_soon() -> None:
    season = _season(21)

    before = pick_view(QATAR - timedelta(seconds=1), season)
    assert (before.phase, before.valid_until) == (Phase.COUNTDOWN, QATAR)

    started = pick_view(QATAR, season)
    assert started.phase is Phase.UNDER_WAY
    assert started.valid_until == QATAR + timedelta(hours=2, minutes=30)

    almost = pick_view(QATAR + timedelta(hours=2, minutes=30, seconds=-1), season)
    assert almost.phase is Phase.UNDER_WAY
    assert almost.valid_until == QATAR + timedelta(hours=2, minutes=30)

    late = pick_view(QATAR + timedelta(hours=2, minutes=30), season)
    assert late.phase is Phase.RESULTS_SOON
    assert late.valid_until == QATAR + timedelta(days=3)


def test_a_race_still_without_results_three_days_on_is_skipped() -> None:
    # Qatar never gets results (cancelled after the calendar was seeded)
    season = _season(21)
    assert pick_view(QATAR + timedelta(days=3, seconds=-1), season).race.round == 22

    skipped = pick_view(QATAR + timedelta(days=3), season)
    assert (skipped.view, skipped.race.round) == (View.RACE_WEEK, 23)


def test_a_result_counts_only_once_its_race_has_started() -> None:
    # The whole season's results are in, but the clock is in the week of Vegas
    everything = _season(23)

    vegas_after = pick_view(_utc("2026-11-24T19:00Z"), everything)
    assert (vegas_after.view, vegas_after.race.round) == (View.AFTER_RACE, 21)
    qatar_week = pick_view(_utc("2026-11-25T19:00Z"), everything)
    assert (qatar_week.view, qatar_week.race.round) == (View.RACE_WEEK, 22)
    assert qatar_week.phase is Phase.COUNTDOWN
    # Qatar's result becomes visible at its start, not before
    assert pick_view(QATAR, everything).view is View.AFTER_RACE


def test_a_season_opener_is_race_week_only_inside_14_days() -> None:
    # No 2027 race has results, so the season isn't under way
    season = _season(23, with_2027=True)
    assert pick_view(_utc("2027-01-10T00:00Z"), season).view is View.OFF_SEASON


def test_the_clock_must_carry_a_time_zone() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        pick_view(datetime(2026, 11, 25, 19), _season(21))
    with pytest.raises(ValueError, match="timezone-aware"):
        Race(2026, 1, datetime(2026, 3, 8, 4), has_results=True)
    with pytest.raises(ValueError, match="timezone-aware"):
        Session("race", datetime(2026, 3, 8, 4))


def test_hours_are_counted_in_utc_across_a_clock_change() -> None:
    # A London start the day before summer time ends: 72 real hours later is
    # 17:00Z, not the 18:00Z a sum on London's wall clock would give
    london = ZoneInfo("Europe/London")
    start = datetime(2026, 10, 24, 18, 0, tzinfo=london)  # 17:00Z
    race = Race(2026, 1, start, has_results=True)
    ends = _utc("2026-10-27T17:00Z")

    after = pick_view(_utc("2026-10-25T12:00Z"), [race])
    assert (after.view, after.valid_until) == (View.AFTER_RACE, ends)
    assert pick_view(ends - timedelta(seconds=1), [race]).view is View.AFTER_RACE
    assert pick_view(ends, [race]).view is View.OFF_SEASON

    # The same for the 2 h 30 of RACE UNDER WAY and a session's LIVE hour
    pending = Race(2026, 1, start, has_results=False)
    late = pick_view(start + timedelta(hours=2, minutes=30), [pending])
    assert late.phase is Phase.RESULTS_SOON
    assert late.valid_until == _utc("2026-10-27T17:00Z")

    # Summer time ends at 01:00Z on Oct 25: a session starting 00:30Z (01:30
    # BST) is LIVE until 01:30Z, one real hour later, not 02:30Z
    night = Session("practice_1", datetime(2026, 10, 25, 1, 30, tzinfo=london))
    assert night.end == _utc("2026-10-25T01:30Z")
    assert next_session_change(_utc("2026-10-25T01:00Z"), [night]) == night.end
    assert _states("2026-10-25T01:29Z", [night]) == [SessionState.LIVE]
    assert _states("2026-10-25T01:30Z", [night]) == [SessionState.DONE]


# ── The weekend's sessions ───────────────────────────────────────

QATAR_WEEKEND = [
    Session("practice_1", _utc("2026-11-27T13:30Z")),
    Session("practice_2", _utc("2026-11-27T17:00Z")),
    Session("practice_3", _utc("2026-11-28T14:30Z")),
    Session("qualifying", _utc("2026-11-28T18:00Z")),
    Session("race", QATAR),
]
CHINA_WEEKEND = [
    Session("practice_1", _utc("2026-03-13T03:30Z")),
    Session("sprint_qualifying", _utc("2026-03-13T07:30Z")),
    Session("sprint", _utc("2026-03-14T03:00Z")),
    Session("qualifying", _utc("2026-03-14T07:00Z")),
    Session("race", _utc("2026-03-15T07:00Z")),
]


def _states(clock: str, weekend: list[Session]) -> list[SessionState]:
    return [state for _, state in session_states(_utc(clock), weekend)]


def test_sessions_are_done_live_next_or_later() -> None:
    d, live, n, later = (
        SessionState.DONE,
        SessionState.LIVE,
        SessionState.NEXT,
        SessionState.LATER,
    )
    assert _states("2026-11-26T12:00Z", QATAR_WEEKEND) == [
        n,
        later,
        later,
        later,
        later,
    ]
    # Practice 2 runs 17:00 to 18:00
    assert _states("2026-11-27T17:30Z", QATAR_WEEKEND) == [d, live, n, later, later]
    assert _states("2026-11-27T18:00Z", QATAR_WEEKEND) == [d, d, n, later, later]
    # The race is LIVE for 2 hours
    assert _states("2026-11-29T17:59Z", QATAR_WEEKEND) == [d, d, d, d, live]
    assert _states("2026-11-29T18:00Z", QATAR_WEEKEND) == [d, d, d, d, d]
    # Sprint qualifying is 45 minutes
    assert _states("2026-03-13T08:14Z", CHINA_WEEKEND)[1] is live
    assert _states("2026-03-13T08:15Z", CHINA_WEEKEND)[1] is d


def test_a_session_with_no_time_is_never_live() -> None:
    weekend = [*QATAR_WEEKEND[:2], Session("practice_3", None), *QATAR_WEEKEND[3:]]
    states = _states("2026-11-28T14:45Z", weekend)
    assert states[2] is SessionState.NEXT
    assert _states("2026-11-28T18:30Z", weekend)[2:4] == [
        SessionState.DONE,
        SessionState.LIVE,
    ]


def test_the_next_session_change_is_the_next_start_or_end() -> None:
    assert next_session_change(_utc("2026-11-27T17:30Z"), QATAR_WEEKEND) == _utc(
        "2026-11-27T18:00Z"
    )
    assert next_session_change(_utc("2026-11-27T18:00Z"), QATAR_WEEKEND) == _utc(
        "2026-11-28T14:30Z"
    )
    assert next_session_change(_utc("2026-11-29T18:00Z"), QATAR_WEEKEND) is None


# ── Title maths ──────────────────────────────────────────────────


def test_points_left_for_drivers_and_teams() -> None:
    # Before Qatar: Qatar and Abu Dhabi left, no sprints
    assert points_left("driver", races_left=2, sprints_left=0) == 50
    assert points_left("constructor", races_left=2, sprints_left=0) == 86
    # A sprint weekend adds 8 for a driver and 15 for a team
    assert points_left("driver", races_left=3, sprints_left=1) == 83
    assert points_left("constructor", races_left=3, sprints_left=1) == 144
    assert points_left("driver", races_left=0, sprints_left=0) == 0
    with pytest.raises(ValueError):
        points_left("driver", races_left=1, sprints_left=2)


def test_a_title_is_decided_only_when_the_lead_beats_the_points_left() -> None:
    left = points_left("driver", races_left=2, sprints_left=0)  # 50
    decided = [Standing("antonelli", 402), Standing("russell", 351)]
    level = [Standing("antonelli", 400), Standing("russell", 350)]
    open_ = [Standing("antonelli", 390), Standing("russell", 362)]

    assert title_decided(decided, left)  # 51 > 50
    assert not title_decided(level, left)  # 50 is not more than 50
    assert not title_decided(open_, left)


def test_who_can_still_finish_second() -> None:
    left = 50
    standings = [
        Standing("antonelli", 402),
        Standing("russell", 300),
        Standing("hamilton", 260),
        Standing("leclerc", 250),  # exactly 50 behind second: a tie is possible
        Standing("norris", 249),
    ]

    contenders = [s.ref for s in can_finish_second(standings, left)]
    assert contenders == ["russell", "hamilton", "leclerc"]
    assert [s.ref for s in can_finish_second(standings, 0)] == ["russell"]
    assert can_finish_second(standings[:1], left) == []


def test_the_teams_title_uses_the_constructors_points_left() -> None:
    left = points_left("constructor", races_left=2, sprints_left=0)  # 86
    decided = [Standing("mercedes", 700), Standing("ferrari", 613)]
    level = [Standing("mercedes", 700), Standing("ferrari", 614)]

    assert title_decided(decided, left)  # 87 > 86
    assert not title_decided(level, left)  # 86 is not more than 86
    # The drivers' 50 would call the level fixture decided: the kinds differ
    assert title_decided(level, points_left("driver", 2, 0))


def test_which_teams_can_still_finish_second() -> None:
    left = points_left("constructor", races_left=1, sprints_left=1)  # 58
    standings = [
        Standing("mercedes", 700),
        Standing("ferrari", 500),
        Standing("mclaren", 442),  # exactly 58 behind second
        Standing("red_bull", 441),
    ]
    assert [s.ref for s in can_finish_second(standings, left)] == [
        "ferrari",
        "mclaren",
    ]


def test_a_tie_on_points_keeps_the_championship_order() -> None:
    # Countback put Russell ahead on equal points
    standings = [Standing("russell", 300), Standing("antonelli", 300)]
    assert not title_decided(standings, 0)
    assert [s.ref for s in can_finish_second(standings, 0)] == ["antonelli"]
