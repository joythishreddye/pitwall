"""The briefing's lines and chips for each view (brief 001), on fixed data."""

import re
import zoneinfo
from dataclasses import replace
from datetime import datetime

import pytest

from app.briefing.clock import Session, View
from app.briefing.lines import (
    CALL_MAX,
    Briefing,
    Driver,
    LastYear,
    LatestRace,
    Line,
    Placed,
    RaceInfo,
    Reigning,
    Snapshot,
    Team,
    build_briefing,
    fit_call,
    reader_zone,
    when,
)


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


# The approved mockup's data after round 20 of 2026 (home-2026-r20.json)
STANDINGS = (
    Driver("ANT", "Antonelli", "Mercedes", 390, 9),
    Driver("VER", "Verstappen", "Red Bull", 279, 3),
    Driver("RUS", "Russell", "Mercedes", 262, 3),
    Driver("HAM", "Hamilton", "Ferrari", 261, 1),
    Driver("LEC", "Leclerc", "Ferrari", 249, 1),
    Driver("NOR", "Norris", "McLaren", 246, 3),
    Driver("PIA", "Piastri", "McLaren", 152, 0),
    Driver("HAD", "Hadjar", "Red Bull", 122, 0),
)
CONSTRUCTORS = (
    Team("Mercedes", "mercedes", 652),
    Team("Ferrari", "ferrari", 510),
    Team("Red Bull", "red_bull", 415),
    Team("McLaren", "mclaren", 398),
    Team("RB", "rb", 114),
)
VEGAS = RaceInfo(
    2026,
    21,
    "Las Vegas Grand Prix",
    _utc("2026-11-22T04:00Z"),
    circuit="Las Vegas Strip Street Circuit",
    locality="Las Vegas",
    sessions=(
        Session("practice_1", _utc("2026-11-20T00:30Z")),
        Session("practice_2", _utc("2026-11-20T04:00Z")),
        Session("practice_3", _utc("2026-11-21T00:30Z")),
        Session("qualifying", _utc("2026-11-21T04:00Z")),
        Session("race", _utc("2026-11-22T04:00Z")),
    ),
)
QATAR = RaceInfo(
    2026,
    22,
    "Qatar Grand Prix",
    _utc("2026-11-29T16:00Z"),
    circuit="Lusail International Circuit",
    locality="Lusail",
)
ABU_DHABI = RaceInfo(
    2026,
    23,
    "Abu Dhabi Grand Prix",
    _utc("2026-12-06T13:00Z"),
    circuit="Yas Marina Circuit",
    locality="Abu Dhabi",
)
OPENER_2027 = RaceInfo(
    2027,
    1,
    "Australian Grand Prix",
    _utc("2027-03-07T04:00Z"),
    circuit="Albert Park Grand Prix Circuit",
    locality="Melbourne",
)
VEGAS_2025 = LastYear(
    2025,
    22,
    (
        Placed("VER", "Verstappen", "Red Bull", 2),
        Placed("RUS", "Russell", "Mercedes", 4),
        Placed("ANT", "Antonelli", "Mercedes", 17),
    ),
    pole="Norris",
)

RACE_WEEK_VEGAS = Snapshot(
    season=2026,
    after_round=20,
    rounds=23,
    standings=STANDINGS,
    constructors=CONSTRUCTORS,
    remaining=(VEGAS, QATAR, ABU_DHABI),
    next_race=VEGAS,
    last_year=VEGAS_2025,
)
AFTER_VEGAS = Snapshot(
    season=2026,
    after_round=21,
    rounds=23,
    standings=STANDINGS,
    constructors=CONSTRUCTORS,
    remaining=(QATAR, ABU_DHABI),
    next_race=QATAR,
    latest=LatestRace(
        VEGAS,
        (
            Placed("ANT", "Antonelli", "Mercedes", 3),
            Placed("VER", "Verstappen", "Red Bull", 1),
            Placed("RUS", "Russell", "Mercedes", 5),
        ),
        points_this_round={"ANT": 25, "VER": 18, "RUS": 15},
    ),
)
# Race week with the title open: nobody else can reach second, and the teams'
# title is open too
RACE_WEEK_OPEN = replace(
    RACE_WEEK_VEGAS,
    standings=(
        replace(STANDINGS[0], points=300),
        STANDINGS[1],
        replace(STANDINGS[2], points=200),
    ),
    constructors=(CONSTRUCTORS[0], replace(CONSTRUCTORS[1], points=600)),
)
SEASON_OVER = Snapshot(
    season=2026,
    after_round=23,
    rounds=23,
    standings=STANDINGS,
    constructors=CONSTRUCTORS,
    remaining=(),
)
OPENER_WEEK = Snapshot(
    season=2027,
    after_round=0,
    rounds=24,
    standings=(),
    constructors=(),
    remaining=(OPENER_2027,),
    next_race=OPENER_2027,
    reigning=Reigning(2026, STANDINGS[0], CONSTRUCTORS[0]),
)


def _tags(b: Briefing) -> list[str]:
    return [line.tag for line in b.lines]


def _calls(b: Briefing) -> list[str]:
    return [line.call for line in b.lines]


# ── Race week ────────────────────────────────────────────────────


def test_race_week_with_the_title_decided_reads_like_the_mockup() -> None:
    b = build_briefing(View.RACE_WEEK, RACE_WEEK_VEGAS, "UTC")

    assert _tags(b) == ["RACE WEEK", "TITLE", "SECOND PLACE", "TEAMS", "LAST YEAR"]
    assert _calls(b) == [
        "Race week: Las Vegas, round 21 of 23.",
        "Antonelli is champion: 111 points clear.",
        "Second is open: Verstappen 279, Russell 262.",
        "Mercedes have the teams' title: 142 clear.",
        "Last year here: Verstappen won from 2nd on the grid.",
    ]
    details = [line.detail for line in b.lines]
    assert details[0] == (
        "The Las Vegas Strip Street Circuit. Practice 1 is Fri 20 Nov, 12:30 am "
        "UTC; qualifying Sat 21 Nov, 4:00 am UTC; lights out Sun 22 Nov, 4:00 am UTC."
    )
    assert details[1] == (
        "Three races are left, worth 75 points at most with no sprints, so the lead "
        "can't be caught. Antonelli has 9 wins this year."
    )
    assert details[2] == (
        "Hamilton has 261, Leclerc 249 and Norris 246. With 75 points left, all "
        "five can still finish second."
    )
    assert details[3] == (
        "Constructors' points: Mercedes 652, Ferrari 510, Red Bull 415 and McLaren "
        "398. With 129 left at most, Mercedes can't be caught; Ferrari, Red Bull "
        "and McLaren can all still finish second."
    )
    assert details[4] == (
        "Las Vegas 2025, round 22: Verstappen won from 2nd on the grid, with "
        "Russell second and Antonelli third. Norris started on pole."
    )
    assert [line.drivers for line in b.lines] == [
        (),
        ("ANT",),
        ("VER", "RUS"),
        (),
        ("VER",),
    ]
    assert b.lines[3].team_id == "mercedes"
    assert b.chips == (
        "When does the race start?",
        "Can anyone catch Antonelli?",
        "Who's fighting for second?",
        "Who won here last year?",
    )


def test_race_week_with_the_title_open() -> None:
    b = build_briefing(View.RACE_WEEK, RACE_WEEK_OPEN, "UTC")
    decided = build_briefing(View.RACE_WEEK, RACE_WEEK_VEGAS, "UTC")

    # No SECOND PLACE (only Verstappen can finish second) and no TEAMS line
    assert _tags(b) == ["RACE WEEK", "TITLE", "LAST YEAR"]
    assert _calls(b) == [
        "Race week: Las Vegas, round 21 of 23.",
        "Antonelli leads by 21, with 75 left.",
        "Last year here: Verstappen won from 2nd on the grid.",
    ]
    assert [line.detail for line in b.lines] == [
        decided.lines[0].detail,
        "Antonelli has 300 points and 9 wins.",
        decided.lines[4].detail,
    ]
    assert [line.drivers for line in b.lines] == [(), ("ANT",), ("VER",)]
    # The brief's four race-week chips stay, second place included: the
    # engineer can say nobody else can reach it
    assert b.chips == decided.chips


def test_race_week_shows_no_fight_for_second_while_the_title_is_open() -> None:
    # The round-20 standings with only the leader's points changed: Russell,
    # Hamilton, Leclerc and Norris could still win the title, and Antonelli
    # could still finish second, so nobody is shown fighting for second
    standings = (replace(STANDINGS[0], points=300), *STANDINGS[1:])
    b = build_briefing(
        View.RACE_WEEK, replace(RACE_WEEK_VEGAS, standings=standings), "UTC"
    )

    assert _tags(b) == ["RACE WEEK", "TITLE", "TEAMS", "LAST YEAR"]
    assert b.lines[1].call == "Antonelli leads by 21, with 75 left."


def test_a_view_given_as_its_plain_value_works_and_an_unknown_one_is_refused() -> None:
    by_value = build_briefing("race_week", RACE_WEEK_VEGAS, "UTC")

    assert by_value == build_briefing(View.RACE_WEEK, RACE_WEEK_VEGAS, "UTC")
    with pytest.raises(ValueError, match="season_over"):
        build_briefing("season_over", RACE_WEEK_VEGAS, "UTC")


def test_race_week_without_a_town_names_the_race_not_its_adjective() -> None:
    snap = replace(RACE_WEEK_VEGAS, next_race=replace(VEGAS, locality=""))
    b = build_briefing(View.RACE_WEEK, snap, "UTC")
    assert b.lines[0].call == "Race week: Las Vegas Grand Prix, round 21 of 23."
    assert b.lines[-1].detail.startswith("Las Vegas Grand Prix 2025, round 22:")


def test_the_run_up_names_the_qualifying_session_not_sprint_qualifying() -> None:
    sprint_weekend = replace(
        QATAR,
        sprint=True,
        sessions=(
            Session("practice_1", _utc("2026-11-27T13:30Z")),
            Session("sprint_qualifying", _utc("2026-11-27T17:30Z")),
            Session("sprint", _utc("2026-11-28T14:00Z")),
            Session("qualifying", _utc("2026-11-28T18:00Z")),
            Session("race", QATAR.start),
        ),
    )
    snap = replace(RACE_WEEK_VEGAS, next_race=sprint_weekend, last_year=None)
    detail = build_briefing(View.RACE_WEEK, snap, "UTC").lines[0].detail
    assert "qualifying Sat 28 Nov, 6:00 pm UTC" in detail
    assert detail.startswith("The Lusail International Circuit. Practice 1 is Fri")


def test_two_teams_left_for_second_read_as_both() -> None:
    teams = (*CONSTRUCTORS[:3], replace(CONSTRUCTORS[3], points=300), CONSTRUCTORS[4])
    snap = replace(RACE_WEEK_VEGAS, constructors=teams)
    detail = build_briefing(View.RACE_WEEK, snap, "UTC").lines[3].detail
    assert detail.endswith(
        "Mercedes can't be caught; Ferrari and Red Bull can both still finish second."
    )


def test_last_year_from_pole_doesnt_name_the_polesitter_twice() -> None:
    podium = (replace(VEGAS_2025.podium[0], grid=1), *VEGAS_2025.podium[1:])
    from_pole = replace(VEGAS_2025, podium=podium, pole="Verstappen")
    snap = replace(RACE_WEEK_VEGAS, last_year=from_pole)
    line = build_briefing(View.RACE_WEEK, snap, "UTC").lines[-1]
    assert line.call == "Last year here: Verstappen won from pole."
    assert line.detail == (
        "Las Vegas 2025, round 22: Verstappen won from pole, with Russell second "
        "and Antonelli third."
    )


def test_race_week_before_a_seasons_first_result() -> None:
    b = build_briefing(View.RACE_WEEK, OPENER_WEEK, "UTC")

    assert _tags(b) == ["RACE WEEK", "TITLE", "TEAMS"]
    assert _calls(b) == [
        "Race week: Melbourne, round 1 of 24.",
        "Antonelli is the reigning champion.",
        "Mercedes are the reigning team champions.",
    ]
    assert b.lines[1].detail == (
        "Antonelli won the 2026 title with 390 points and 9 wins. No 2027 race has a "
        "result yet."
    )
    assert b.chips == (
        "When does the race start?",
        "How did Antonelli win the 2026 title?",
        "Who won the teams' title?",
        "Who won here last year?",
    )


# ── After a race ─────────────────────────────────────────────────


def test_after_a_race_reads_the_result_title_and_next_race() -> None:
    b = build_briefing(View.AFTER_RACE, AFTER_VEGAS, "UTC")

    assert _tags(b) == ["RESULT", "RESULT", "RESULT", "TITLE", "NEXT RACE"]
    assert _calls(b) == [
        "Antonelli won in Las Vegas, from 3rd on the grid.",
        "Verstappen second, from pole.",
        "Russell third: two Mercedes cars on the podium.",
        "Antonelli is champion: 111 points clear.",
        "Next: Lusail, Sun 29 Nov, 4:00 pm UTC.",
    ]
    assert b.lines[0].detail == (
        "Antonelli won the Las Vegas Grand Prix for Mercedes, from 3rd on the grid."
    )
    assert b.lines[1].detail == (
        "Verstappen finished second for Red Bull, from pole. Verstappen is second "
        "in the championship, 17 points ahead of Russell."
    )
    assert b.lines[3].detail == (
        "Antonelli scored 25 points in Las Vegas and has 390. Two races are left, "
        "worth 50 points at most with no sprints, so the lead can't be caught."
    )
    assert b.lines[4].detail == (
        "Round 22 of 23, at the Lusail International Circuit. Lights out Sun 29 "
        "Nov, 4:00 pm UTC. Then Abu Dhabi on Sun 6 Dec."
    )
    assert b.chips == (
        "Who won in Las Vegas?",
        "How did Verstappen get to second?",
        "Who gained the most places?",
        "When's the next race?",
    )


def test_after_a_race_without_its_points_drops_the_points_scored() -> None:
    latest = replace(AFTER_VEGAS.latest, points_this_round=None)
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, latest=latest), "UTC")
    base = build_briefing(View.AFTER_RACE, AFTER_VEGAS, "UTC")

    assert _calls(b) == _calls(base)
    assert b.lines[3].detail == (
        "Two races are left, worth 50 points at most with no sprints, so the lead "
        "can't be caught."
    )
    assert [x.detail for i, x in enumerate(b.lines) if i != 3] == [
        x.detail for i, x in enumerate(base.lines) if i != 3
    ]
    assert b.chips == base.chips


def test_after_a_race_asks_about_its_biggest_moment_when_the_data_has_one() -> None:
    moment = "When did the safety car come out?"
    latest = replace(AFTER_VEGAS.latest, biggest_moment=moment)
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, latest=latest), "UTC")
    assert b.chips == (
        "Who won in Las Vegas?",
        "How did Verstappen get to second?",
        moment,
        "When's the next race?",
    )
    assert _calls(b) == _calls(build_briefing(View.AFTER_RACE, AFTER_VEGAS, "UTC"))


BRITISH = RaceInfo(
    2026,
    12,
    "British Grand Prix",
    _utc("2026-07-05T14:00Z"),
    circuit="Silverstone Circuit",
    locality="Silverstone",
)


def test_a_race_named_for_its_country_is_placed_by_its_town() -> None:
    latest = replace(AFTER_VEGAS.latest, race=BRITISH)
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, latest=latest), "UTC")
    assert b.lines[0].call == "Antonelli won in Silverstone, from 3rd on the grid."
    assert b.lines[0].detail.startswith("Antonelli won the British Grand Prix for")
    assert b.lines[3].detail.startswith("Antonelli scored 25 points in Silverstone")
    assert b.chips[0] == "Who won in Silverstone?"

    no_town = replace(latest, race=replace(BRITISH, locality=""))
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, latest=no_town), "UTC")
    assert b.lines[0].call == "Antonelli won at the British Grand Prix."
    assert b.lines[3].detail.startswith("Antonelli scored 25 points at the British")
    assert b.chips[0] == "Who won at the British Grand Prix?"
    texts = [t for x in b.lines for t in (x.call, x.detail)] + list(b.chips)
    assert not [t for t in texts if re.search(r"\bBritish\b(?! Grand Prix)", t)]


def test_the_next_race_detail_names_two_races_then_counts_the_rest() -> None:
    bahrain = replace(
        ABU_DHABI,
        round=24,
        name="Bahrain Grand Prix",
        start=_utc("2026-12-13T15:00Z"),
        locality="Sakhir",
    )
    saudi = replace(
        ABU_DHABI,
        round=25,
        name="Saudi Arabian Grand Prix",
        start=_utc("2026-12-20T17:00Z"),
        locality="Jeddah",
    )
    snap = replace(AFTER_VEGAS, rounds=25, remaining=(QATAR, ABU_DHABI, bahrain, saudi))
    b = build_briefing(View.AFTER_RACE, snap, "UTC")
    assert b.lines[4].detail == (
        "Round 22 of 25, at the Lusail International Circuit. Lights out Sun 29 "
        "Nov, 4:00 pm UTC. Then Abu Dhabi on Sun 6 Dec, Sakhir on Sun 13 Dec and 1 "
        "more."
    )


def test_two_of_one_team_on_the_podium_reads_as_cars() -> None:
    podium = (
        Placed("VER", "Verstappen", "Red Bull", 1),
        Placed("ANT", "Antonelli", "Mercedes", 3),
        Placed("HAD", "Hadjar", "Red Bull", 4),
    )
    latest = replace(AFTER_VEGAS.latest, podium=podium)
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, latest=latest), "UTC")
    assert b.lines[2].call == "Hadjar third: two Red Bull cars on the podium."


def test_a_third_place_from_another_team_and_a_pit_lane_start() -> None:
    podium = (
        Placed("ANT", "Antonelli", "Mercedes", 3),
        Placed("VER", "Verstappen", "Red Bull", 1),
        Placed("LEC", "Leclerc", "Ferrari", 0),
    )
    latest = replace(AFTER_VEGAS.latest, podium=podium)
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, latest=latest), "UTC")
    assert b.lines[2].call == "Leclerc third, from the pit lane."


def test_after_the_last_race_with_no_later_race_in_the_data() -> None:
    latest = replace(AFTER_VEGAS.latest, race=ABU_DHABI)
    snap = replace(
        AFTER_VEGAS, after_round=23, remaining=(), next_race=None, latest=latest
    )
    b = build_briefing(View.AFTER_RACE, snap, "UTC")

    assert _tags(b) == ["RESULT", "RESULT", "RESULT", "TITLE", "NEXT RACE"]
    assert _calls(b) == [
        "Antonelli won in Abu Dhabi, from 3rd on the grid.",
        "Verstappen second, from pole.",
        "Russell third: two Mercedes cars on the podium.",
        "Antonelli is champion: 111 points clear.",
        "No 2027 dates yet.",
    ]
    assert b.chips == (
        "Who won in Abu Dhabi?",
        "How did Verstappen get to second?",
        "Who gained the most places?",
        "When's the next race?",
    )
    assert b.lines[3].detail == (
        "Antonelli scored 25 points in Abu Dhabi and has 390. "
        "That was the season's last race."
    )
    assert b.lines[4].call == "No 2027 dates yet."
    assert b.lines[4].detail == (
        "There's no 2027 calendar in the data yet. When it's out, this line shows "
        "round 1."
    )

    snap = replace(snap, next_race=OPENER_2027)
    with_opener = build_briefing(View.AFTER_RACE, snap, "UTC")
    assert with_opener.lines[4].call == "Next: Melbourne, Sun 7 Mar, 4:00 am UTC."
    assert with_opener.lines[4].detail == (
        "Round 1 of the 2027 season, at the Albert Park Grand Prix Circuit. Lights "
        "out Sun 7 Mar, 4:00 am UTC."
    )


def test_one_win_or_one_point_reads_in_the_singular() -> None:
    early = (
        Driver("ANT", "Antonelli", "Mercedes", 25, 1),
        Driver("VER", "Verstappen", "Red Bull", 18, 0),
        Driver("RUS", "Russell", "Mercedes", 15, 0),
    )
    week_snap = replace(RACE_WEEK_VEGAS, standings=early, after_round=1)
    week = build_briefing(View.RACE_WEEK, week_snap, "UTC")
    close = (
        replace(STANDINGS[0], points=300, wins=1),
        replace(STANDINGS[1], points=299),
        replace(STANDINGS[2], points=298),
        *STANDINGS[3:],
    )
    latest = replace(AFTER_VEGAS.latest, race=ABU_DHABI, points_this_round={"ANT": 1})
    final = replace(
        AFTER_VEGAS,
        after_round=23,
        remaining=(),
        next_race=None,
        latest=latest,
        standings=close,
    )
    after = build_briefing(View.AFTER_RACE, final, "UTC")
    off = build_briefing(View.OFF_SEASON, replace(SEASON_OVER, standings=close), "UTC")

    assert week.lines[1].detail == "Antonelli has 25 points and 1 win."
    assert after.lines[3].call == "Antonelli is champion: 1 point clear."
    assert "1 point ahead of Russell." in after.lines[1].detail
    assert after.lines[3].detail.startswith("Antonelli scored 1 point in Abu Dhabi")
    assert off.lines[0].detail.startswith("Antonelli has 1 win and 300 points after")
    texts = [
        text
        for b in (week, after, off)
        for line in b.lines
        for text in (line.call, line.detail)
    ]
    assert [t for t in texts if re.search(r"\b1 (wins|points)\b", t)] == []


def test_race_week_refuses_a_snapshot_from_another_season() -> None:
    # Race week before the 2027 opener counts 2027's rounds and title, so a
    # 2026 snapshot would read "round 1 of 23" and crown 2026's leader
    snap = replace(RACE_WEEK_VEGAS, next_race=OPENER_2027)

    with pytest.raises(ValueError, match="needs the 2027 snapshot, not 2026's"):
        build_briefing(View.RACE_WEEK, snap, "UTC")


def test_a_title_still_open_after_a_race_has_no_title_line() -> None:
    close = (replace(STANDINGS[0], points=300), *STANDINGS[1:])
    b = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, standings=close), "UTC")
    assert _tags(b) == ["RESULT", "RESULT", "RESULT", "NEXT RACE"]


# ── Off-season ───────────────────────────────────────────────────


def test_the_off_season_with_no_next_season_in_the_data() -> None:
    b = build_briefing(View.OFF_SEASON, SEASON_OVER, "UTC")

    assert _tags(b) == ["CHAMPION", "SECOND PLACE", "TEAMS", "NEXT SEASON"]
    assert _calls(b) == [
        "Antonelli is the 2026 champion.",
        "Verstappen is second, 17 ahead of Russell.",
        "Mercedes won the teams' title: 652 points.",
        "No 2027 dates yet. I'll brief you when there are.",
    ]
    assert b.lines[0].detail == (
        "Antonelli has 9 wins and 390 points after round 23, 111 clear of Verstappen."
    )
    assert b.lines[1].detail == "Verstappen has 279, Russell 262 and Hamilton 261."
    assert b.lines[2].detail == (
        "Ferrari have 510, Red Bull 415 and McLaren 398, after round 23."
    )
    assert b.chips == (
        "How did Antonelli win it?",
        "Who's second overall?",
        "Who won the teams' title?",
        "When does 2027 start?",
    )


def test_the_off_season_gives_round_one_when_its_in_the_data() -> None:
    snap = replace(SEASON_OVER, next_race=OPENER_2027)

    utc = build_briefing(View.OFF_SEASON, snap, "UTC").lines[-1]
    assert utc.call == "2027 starts Sun 7 Mar in Melbourne."
    full = build_briefing(View.OFF_SEASON, snap, "America/Los_Angeles")
    la = full.lines[-1]
    assert la.call == "2027 starts Sat 6 Mar in Melbourne."
    without = build_briefing(View.OFF_SEASON, SEASON_OVER, "America/Los_Angeles")
    assert _tags(full) == _tags(without)
    assert _calls(full)[:3] == _calls(without)[:3]
    assert full.chips == without.chips
    assert la.detail == (
        "Round 1 is the Australian Grand Prix, at the Albert Park Grand Prix "
        "Circuit: lights out Sat 6 Mar, 8:00 pm PST."
    )


def test_the_off_season_crowns_no_one_a_race_without_a_result_could_still_change() -> (
    None
):
    # Part 1 leaves a race with no result 3 days after its start, so the off-season
    # can come with the finale still in the data. A cancelled race and a late
    # result look the same there, so the race still counts as left to run
    close = (replace(STANDINGS[0], points=299), *STANDINGS[1:])
    snap = replace(SEASON_OVER, after_round=22, standings=close, remaining=(ABU_DHABI,))
    b = build_briefing(View.OFF_SEASON, snap, "UTC")
    assert _tags(b) == ["TITLE", "SECOND PLACE", "TEAMS", "NEXT SEASON"]
    assert b.lines[0].call == "Antonelli leads by 20 after round 22."
    assert b.lines[0].detail == (
        "Antonelli has 9 wins and 299 points. The Abu Dhabi Grand Prix has no "
        "result in the data yet, worth 25 points at most."
    )
    texts = [t for x in b.lines for t in (x.call, x.detail)] + list(b.chips)
    assert not [t for t in texts if "champion" in t.lower()]
    assert b.chips[0] == "Can anyone catch Antonelli?"
    # 142 clear with 43 left: the teams' title is decided all the same
    assert b.lines[2].call == "Mercedes won the teams' title: 652 points."
    assert b.chips[2] == "Who won the teams' title?"

    # A lead bigger than what's left still names the champion
    clear = build_briefing(View.OFF_SEASON, replace(snap, standings=STANDINGS), "UTC")
    assert clear.lines[0].call == "Antonelli is the 2026 champion."
    assert clear.chips[0] == "How did Antonelli win it?"

    # And a teams' fight the race could change names no team champion
    teams = (CONSTRUCTORS[0], replace(CONSTRUCTORS[1], points=630), *CONSTRUCTORS[2:])
    open_teams = build_briefing(
        View.OFF_SEASON, replace(snap, constructors=teams), "UTC"
    )
    assert "TEAMS" not in _tags(open_teams)
    assert open_teams.chips[2] == "Who leads the teams' title?"


def test_the_off_season_counts_every_race_without_a_result() -> None:
    late = replace(ABU_DHABI, round=22, name="Qatar Grand Prix")
    close = (replace(STANDINGS[0], points=299), *STANDINGS[1:])
    two = replace(
        SEASON_OVER, after_round=21, standings=close, remaining=(late, ABU_DHABI)
    )
    b = build_briefing(View.OFF_SEASON, two, "UTC")
    assert b.lines[0].detail.endswith(
        "Two races have no result in the data yet, worth 50 points at most."
    )


def test_points_level_at_the_top_read_as_level_not_a_lead_of_zero() -> None:
    level = (STANDINGS[0], replace(STANDINGS[1], points=390), *STANDINGS[2:])
    week_snap = replace(RACE_WEEK_VEGAS, standings=level)
    week = build_briefing(View.RACE_WEEK, week_snap, "UTC")
    assert week.lines[1].call == "Antonelli and Verstappen level on points, 75 left."

    over = build_briefing(View.OFF_SEASON, replace(SEASON_OVER, standings=level), "UTC")
    assert over.lines[0].detail == (
        "Antonelli has 9 wins and 390 points after round 23, level on points "
        "with Verstappen."
    )

    tied = (STANDINGS[0], STANDINGS[1], replace(STANDINGS[2], points=279))
    tied += STANDINGS[3:]
    over_snap = replace(SEASON_OVER, standings=tied)
    second = build_briefing(View.OFF_SEASON, over_snap, "UTC")
    assert second.lines[1].call == "Verstappen is second, level on points with Russell."
    after = build_briefing(View.AFTER_RACE, replace(AFTER_VEGAS, standings=tied), "UTC")
    assert after.lines[1].detail.endswith(
        "Verstappen is second in the championship, level on points with Russell."
    )
    for b in (week, over, second, after):
        texts = [t for x in b.lines for t in (x.call, x.detail)]
        assert not [t for t in texts if re.search(r"\b0 (points )?(ahead|clear)", t)]


def test_a_final_tie_on_points_still_names_the_champions() -> None:
    # Nothing left to run: the final order decides (countback), level or not
    level = (STANDINGS[0], replace(STANDINGS[1], points=390), *STANDINGS[2:])
    teams = (CONSTRUCTORS[0], replace(CONSTRUCTORS[1], points=652), *CONSTRUCTORS[2:])
    latest = replace(AFTER_VEGAS.latest, race=ABU_DHABI)
    last_race = replace(
        AFTER_VEGAS,
        after_round=23,
        standings=level,
        constructors=teams,
        remaining=(),
        next_race=None,
        latest=latest,
    )
    after = build_briefing(View.AFTER_RACE, last_race, "UTC")
    assert _tags(after) == ["RESULT", "RESULT", "RESULT", "TITLE", "NEXT RACE"]
    assert after.lines[3].call == "Antonelli is champion, level on points."

    over = replace(SEASON_OVER, standings=level, constructors=teams)
    b = build_briefing(View.OFF_SEASON, over, "UTC")
    assert _tags(b) == ["CHAMPION", "SECOND PLACE", "TEAMS", "NEXT SEASON"]
    assert b.lines[2].call == "Mercedes won the teams' title: 652 points."

    # With races still to run, a tie is still open: no champion, no TEAMS line
    week = build_briefing(
        View.RACE_WEEK,
        replace(RACE_WEEK_VEGAS, standings=level, constructors=teams),
        "UTC",
    )
    assert _tags(week) == ["RACE WEEK", "TITLE", "LAST YEAR"]
    assert week.lines[1].call == "Antonelli and Verstappen level on points, 75 left."


@pytest.mark.parametrize(
    ("view", "snap"),
    [
        (View.RACE_WEEK, RACE_WEEK_VEGAS),
        (View.AFTER_RACE, AFTER_VEGAS),
        (View.OFF_SEASON, SEASON_OVER),
    ],
)
def test_one_driver_and_one_team_in_the_standings(view: View, snap: Snapshot) -> None:
    alone = replace(snap, standings=STANDINGS[:1], constructors=CONSTRUCTORS[:1])
    b = build_briefing(view, alone, "UTC")
    texts = [t for x in b.lines for t in (x.call, x.detail)]
    assert not [t for t in texts if "level" in t or re.search(r"\b0 (points )?", t)]
    if view is View.RACE_WEEK:
        assert b.lines[1].call == "Title leader: Antonelli."
    if view is View.OFF_SEASON:
        assert b.lines[0].call == "Antonelli is the 2026 champion."


# ── Time zones ───────────────────────────────────────────────────


def test_times_are_in_the_readers_zone_with_its_abbreviation() -> None:
    la = build_briefing(View.RACE_WEEK, RACE_WEEK_VEGAS, "America/Los_Angeles")
    assert la.zone == "America/Los_Angeles"
    assert la.lines[0].detail == (
        "The Las Vegas Strip Street Circuit. Practice 1 is Thu 19 Nov, 4:30 pm "
        "PST; qualifying Fri 20 Nov, 8:00 pm PST; lights out Sat 21 Nov, 8:00 pm PST."
    )
    after = build_briefing(View.AFTER_RACE, AFTER_VEGAS, "America/Los_Angeles")
    assert after.lines[4].call == "Next: Lusail, Sun 29 Nov, 8:00 am PST."

    # Summer time in Los Angeles
    summer = replace(QATAR, start=_utc("2026-07-05T14:00Z"))
    b = build_briefing(
        View.AFTER_RACE,
        replace(AFTER_VEGAS, next_race=summer, remaining=(summer,)),
        "America/Los_Angeles",
    )
    assert b.lines[4].call == "Next: Lusail, Sun 5 Jul, 7:00 am PDT."


@pytest.mark.parametrize(
    "zone", [None, "", "   ", "Europe/../UTC", "/etc/localtime", "Not/AZone", "America"]
)
def test_a_missing_unknown_or_path_like_zone_falls_back_to_utc(
    zone: str | None,
) -> None:
    assert reader_zone(zone).tzname(None) == "UTC"
    b = build_briefing(View.AFTER_RACE, AFTER_VEGAS, zone)
    assert b.zone == "UTC"
    assert b.lines[4].call == "Next: Lusail, Sun 29 Nov, 4:00 pm UTC."


def test_zone_names_resolve_without_the_hosts_zone_files() -> None:
    # A slim container can lack /usr/share/zoneinfo. The pinned tzdata package
    # must still give Los Angeles, not a silent fall back to UTC
    zoneinfo.ZoneInfo.clear_cache()
    zoneinfo.reset_tzpath(to=[])
    try:
        zone = reader_zone("America/Los_Angeles")
        assert getattr(zone, "key", None) == "America/Los_Angeles"
        assert datetime(2026, 1, 1, tzinfo=zone).tzname() == "PST"
    finally:
        zoneinfo.reset_tzpath()
        zoneinfo.ZoneInfo.clear_cache()


# ── Every call fits, and nothing prints a missing value ─────────


LONG_SURNAME = "Montgomerie-Charrington"  # the longest in Jolpica since 1950
LONG_TEAM = "Lotus-Pratt & Whitney"  # the longest constructor name
LONG_PLACE = "Eastern Cape Province"  # the longest circuit locality


def _long(snap: Snapshot) -> Snapshot:
    def driver(d: Driver) -> Driver:
        return replace(d, last=LONG_SURNAME, team=LONG_TEAM)

    def placed(p: Placed) -> Placed:
        return replace(p, last=LONG_SURNAME, team=LONG_TEAM, grid=19)

    def race(r: RaceInfo | None) -> RaceInfo | None:
        if r is None:
            return None
        return replace(
            r,
            name="Eastern Cape Province Grand Prix",
            locality=LONG_PLACE,
            circuit="Autodromo Internazionale del Mugello",
            round=22,
        )

    latest = snap.latest and replace(
        snap.latest,
        race=race(snap.latest.race),
        podium=tuple(placed(p) for p in snap.latest.podium),
    )
    last_year = snap.last_year and replace(
        snap.last_year, podium=tuple(placed(p) for p in snap.last_year.podium)
    )
    reigning = snap.reigning and replace(
        snap.reigning,
        champion=driver(snap.reigning.champion),
        team=replace(snap.reigning.team, name=LONG_TEAM),
    )
    return replace(
        snap,
        rounds=24,
        standings=tuple(driver(d) for d in snap.standings),
        constructors=tuple(replace(t, name=LONG_TEAM) for t in snap.constructors),
        remaining=tuple(race(r) for r in snap.remaining),
        next_race=race(snap.next_race),
        latest=latest,
        last_year=last_year,
        reigning=reigning,
    )


EVERY_FIXTURE = [
    (View.RACE_WEEK, RACE_WEEK_VEGAS),
    (View.RACE_WEEK, RACE_WEEK_OPEN),
    (View.RACE_WEEK, OPENER_WEEK),
    (View.AFTER_RACE, AFTER_VEGAS),
    (View.AFTER_RACE, replace(AFTER_VEGAS, next_race=None, remaining=())),
    (View.OFF_SEASON, SEASON_OVER),
    (View.OFF_SEASON, replace(SEASON_OVER, next_race=OPENER_2027)),
]


@pytest.mark.parametrize("zone", ["America/Los_Angeles", "UTC"])
@pytest.mark.parametrize("names", ["real", "longest"])
@pytest.mark.parametrize(("view", "snap"), EVERY_FIXTURE)
def test_every_call_fits_and_nothing_prints_a_missing_value(
    view: View, snap: Snapshot, names: str, zone: str
) -> None:
    b = build_briefing(view, _long(snap) if names == "longest" else snap, zone)

    assert b.lines
    assert len(b.chips) == 4
    for line in b.lines:
        assert 0 < len(line.call) <= CALL_MAX, line.call
        assert len(line.drivers) <= 2
    texts = [t for line in b.lines for t in (line.call, line.detail)] + list(b.chips)
    for text in texts:
        assert "undefined" not in text, text
        assert "None" not in text, text
        assert not re.search(r"\bnan\b", text, re.IGNORECASE), text


# A driver is named, never "he": the rules can't know anyone's pronouns
_PRONOUN = re.compile(r"\b(he|him|his|she|her|hers)\b", re.IGNORECASE)


@pytest.mark.parametrize(("view", "snap"), EVERY_FIXTURE)
def test_the_lines_name_drivers_instead_of_guessing_pronouns(
    view: View, snap: Snapshot
) -> None:
    b = build_briefing(view, snap, "UTC")

    texts = [t for line in b.lines for t in (line.call, line.detail)] + list(b.chips)
    for text in texts:
        assert not _PRONOUN.search(text), text


RACE_LINES = {"RACE WEEK", "NEXT RACE", "NEXT SEASON"}


@pytest.mark.parametrize("zone", ["America/Los_Angeles", "UTC"])
@pytest.mark.parametrize("names", ["real", "longest"])
@pytest.mark.parametrize(("view", "snap"), EVERY_FIXTURE)
def test_a_shortened_call_keeps_the_start_time_in_its_detail(
    view: View, snap: Snapshot, names: str, zone: str
) -> None:
    snap = _long(snap) if names == "longest" else snap
    b = build_briefing(view, snap, zone)

    race_lines = [line for line in b.lines if line.tag in RACE_LINES]
    if snap.next_race is None:
        assert all("dates yet" in line.call for line in race_lines)
        return
    assert race_lines
    lights_out = when(snap.next_race.start, reader_zone(zone))
    for line in race_lines:
        assert lights_out in line.call + " " + line.detail, line


def test_a_call_that_cant_fit_is_an_error_not_a_cut_line() -> None:
    assert fit_call("x" * 60, "", "Short.") == "Short."
    with pytest.raises(ValueError, match="52"):
        fit_call("x" * 53, "y" * 60)


def test_half_points_print_as_they_are() -> None:
    half = (replace(STANDINGS[0], points=390.5), *STANDINGS[1:])
    b = build_briefing(View.OFF_SEASON, replace(SEASON_OVER, standings=half), "UTC")
    assert b.lines[0].detail == (
        "Antonelli has 9 wins and 390.5 points after round 23, 111.5 clear of "
        "Verstappen."
    )


def _title(b: Briefing) -> Line:
    return next(x for x in b.lines if x.tag == "TITLE")


def test_a_sprint_already_run_no_longer_counts_toward_the_points_left() -> None:
    # The final weekend between its sprint and its Grand Prix: Antonelli is 30
    # clear, and only the Grand Prix's 25 points are still to win
    run = replace(ABU_DHABI, sprint=True, sprint_run=True)
    to_run = replace(run, sprint_run=False)
    week = replace(
        RACE_WEEK_VEGAS,
        after_round=22,
        standings=(replace(STANDINGS[0], points=309), *STANDINGS[1:]),
        last_year=None,
    )

    after_sprint = build_briefing(
        View.RACE_WEEK, replace(week, remaining=(run,), next_race=run), "UTC"
    )
    before_sprint = build_briefing(
        View.RACE_WEEK, replace(week, remaining=(to_run,), next_race=to_run), "UTC"
    )

    assert _title(after_sprint).call == "Antonelli is champion: 30 points clear."
    assert _title(after_sprint).detail.startswith(
        "One race is left, worth 25 points at most with no sprints"
    )
    assert _title(before_sprint).call == "Antonelli leads by 30, with 33 left."


def test_a_champion_alone_in_the_standings_is_clear_of_nobody() -> None:
    finale = replace(
        AFTER_VEGAS,
        after_round=23,
        standings=(STANDINGS[0],),
        remaining=(),
        next_race=None,
        latest=replace(AFTER_VEGAS.latest, race=ABU_DHABI),
    )

    b = build_briefing(View.AFTER_RACE, finale, "UTC")

    assert _title(b).call == "Antonelli is the champion."


@pytest.mark.parametrize(
    ("view", "snapshot", "message"),
    [
        (
            View.AFTER_RACE,
            replace(AFTER_VEGAS, latest=replace(AFTER_VEGAS.latest, race=OPENER_2027)),
            "after a 2027 race the 2027 snapshot is needed, not 2026's",
        ),
        (
            View.AFTER_RACE,
            replace(AFTER_VEGAS, next_race=None),
            "races are left to run but the next race is missing",
        ),
        (
            View.OFF_SEASON,
            replace(OPENER_WEEK, next_race=OPENER_2027),
            "the off-season after 2027 needs a later season's race, not 2027's",
        ),
    ],
)
def test_a_snapshot_that_doesnt_fit_its_view_is_refused(
    view: View, snapshot: Snapshot, message: str
) -> None:
    with pytest.raises(ValueError, match=re.escape(message)):
        build_briefing(view, snapshot, "UTC")
