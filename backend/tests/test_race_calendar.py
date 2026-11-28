"""The chat's race calendar note: the weekend's sessions, the last race and the next."""

import json
from datetime import UTC, date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.rag.race_calendar import calendar_note, race_calendar_note
from app.schedule import RoundSchedule, Session


def _at(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _weekend(
    season: int,
    rnd: int,
    name: str,
    sessions: list[tuple[str, str]],
    sprint: bool = False,
) -> RoundSchedule:
    """sessions: (name, "YYYY-MM-DD" for a day with no time, or an ISO start)."""
    built = []
    for session, when in sessions:
        if "T" in when:
            start = _at(when)
            built.append(Session(session, start.date(), start))
        else:
            built.append(Session(session, date.fromisoformat(when), None))
    return RoundSchedule(season, rnd, name, "ref", sprint, tuple(built))


VEGAS = _weekend(
    2026,
    21,
    "Las Vegas Grand Prix",
    [("qualifying", "2026-11-21T04:00:00Z"), ("race", "2026-11-22T04:00:00Z")],
)
QATAR = _weekend(
    2026,
    22,
    "Qatar Grand Prix",
    [
        ("practice_1", "2026-11-27T13:30:00Z"),
        ("practice_2", "2026-11-27T17:00:00Z"),
        ("practice_3", "2026-11-28T14:30:00Z"),
        ("qualifying", "2026-11-28T18:00:00Z"),
        ("race", "2026-11-29T16:00:00Z"),
    ],
)
ABU_DHABI = _weekend(
    2026,
    23,
    "Abu Dhabi Grand Prix",
    [("qualifying", "2026-12-05T14:00:00Z"), ("race", "2026-12-06T13:00:00Z")],
)
SEASON = [ABU_DHABI, QATAR, VEGAS]  # any order


def test_race_week_lists_the_weekend_with_done_and_next_sessions() -> None:
    note = calendar_note(_at("2026-11-28T17:42:00Z"), SEASON)

    assert note == "\n".join(
        [
            "Now: Sat 28 Nov 2026, 17:42 UTC. All times are UTC.",
            "Last race: Las Vegas Grand Prix (2026, round 21 of 3), "
            "Sun 22 Nov 2026, 04:00 UTC.",
            "This race weekend: Qatar Grand Prix (2026, round 22 of 3):",
            "- Practice 1: Fri 27 Nov 2026, 13:30 UTC (done)",
            "- Practice 2: Fri 27 Nov 2026, 17:00 UTC (done)",
            "- Practice 3: Sat 28 Nov 2026, 14:30 UTC (done)",
            "- Qualifying: Sat 28 Nov 2026, 18:00 UTC (next)",
            "- Race: Sun 29 Nov 2026, 16:00 UTC",
            "After that: Abu Dhabi Grand Prix (2026, round 23 of 3), "
            "race Sun 6 Dec 2026, 13:00 UTC.",
        ]
    )


def test_a_weekend_not_started_yet_is_the_next_one() -> None:
    note = calendar_note(_at("2026-11-24T12:00:00Z"), SEASON)

    assert "Next race weekend: Qatar Grand Prix (2026, round 22 of 3):" in note
    assert "- Practice 1: Fri 27 Nov 2026, 13:30 UTC (next)" in note
    assert "(done)" not in note


def test_the_race_is_on_now_until_its_scheduled_end() -> None:
    note = calendar_note(_at("2026-11-29T17:59:00Z"), SEASON)

    assert "This race weekend: Qatar Grand Prix" in note
    assert "- Race: Sun 29 Nov 2026, 16:00 UTC (on now)" in note
    assert "Last race: Las Vegas Grand Prix" in note


def test_the_weekend_stays_until_race_week_ends_like_the_homepage() -> None:
    # The race's session ends at 2 h (done), but the homepage's picture says
    # RACE UNDER WAY until 2 h 30, and a red-flagged race can run on
    note = calendar_note(_at("2026-11-29T18:10:00Z"), SEASON)

    assert "This race weekend: Qatar Grand Prix" in note
    assert "- Race: Sun 29 Nov 2026, 16:00 UTC (done)" in note
    assert "Last race: Las Vegas Grand Prix" in note


def test_after_the_race_the_next_weekend_takes_over() -> None:
    note = calendar_note(_at("2026-11-29T18:30:00Z"), SEASON)

    assert "Last race: Qatar Grand Prix (2026, round 22 of 3), " in note
    assert "Next race weekend: Abu Dhabi Grand Prix (2026, round 23 of 3):" in note
    assert "- Qualifying: Sat 5 Dec 2026, 14:00 UTC (next)" in note
    # The last round of the data: nothing after it
    assert note.endswith("No race after it is in PitWall's schedule yet.")


def test_after_the_last_race_no_later_race_is_known() -> None:
    note = calendar_note(_at("2026-12-10T09:00:00Z"), SEASON)

    assert note == "\n".join(
        [
            "Now: Thu 10 Dec 2026, 09:00 UTC. All times are UTC.",
            "Last race: Abu Dhabi Grand Prix (2026, round 23 of 3), "
            "Sun 6 Dec 2026, 13:00 UTC.",
            "No later race is in PitWall's schedule yet.",
        ]
    )


def test_next_seasons_first_round_follows_the_last_race() -> None:
    note = calendar_note(_at("2026-12-10T09:00:00Z"), [*SEASON, MELBOURNE])

    assert "Last race: Abu Dhabi Grand Prix (2026, round 23 of 3)" in note
    assert "Next race weekend: Australian Grand Prix (2027, round 1 of 1):" in note


MELBOURNE = _weekend(
    2027,
    1,
    "Australian Grand Prix",
    [("practice_1", "2027-03-05T01:30:00Z"), ("race", "2027-03-07T04:00:00Z")],
)


def test_next_seasons_opener_is_named_while_this_season_runs() -> None:
    note = calendar_note(_at("2026-11-28T17:42:00Z"), [*SEASON, MELBOURNE])

    assert "After that: Abu Dhabi Grand Prix (2026, round 23 of 3), " in note
    assert note.endswith(
        "Next season's first race: Australian Grand Prix (2027, round 1 of 1), "
        "race Sun 7 Mar 2027, 04:00 UTC."
    )


def test_next_seasons_opener_is_named_once() -> None:
    # Abu Dhabi's weekend: the opener is already the race after it
    note = calendar_note(_at("2026-12-05T12:00:00Z"), [*SEASON, MELBOURNE])

    assert "After that: Australian Grand Prix (2027, round 1 of 1), " in note
    assert "Next season's first race" not in note


def test_weekends_go_in_race_order_like_the_homepage() -> None:
    # A round postponed past the next one keeps its number
    postponed = _weekend(
        2026,
        21,
        "Postponed Grand Prix",
        [("race", "2026-12-13T13:00:00Z")],
    )
    note = calendar_note(_at("2026-11-28T17:42:00Z"), [postponed, QATAR, ABU_DHABI])

    assert "This race weekend: Qatar Grand Prix" in note
    assert "After that: Abu Dhabi Grand Prix" in note


def test_a_session_with_no_time_shows_its_day() -> None:
    weekend = _weekend(
        2026,
        5,
        "Miami Grand Prix",
        [("sprint", "2026-05-02"), ("race", "2026-05-03")],
        sprint=True,
    )
    note = calendar_note(_at("2026-05-03T23:00:00Z"), [weekend])

    # A race with no time is still ahead on its own day (UTC), then over
    assert "This race weekend: Miami Grand Prix (2026, round 5 of 1), a sprint" in note
    assert "- Race: Sun 3 May 2026, time not set" in note
    later = calendar_note(_at("2026-05-04T00:00:00Z"), [weekend])
    last = "Last race: Miami Grand Prix (2026, round 5 of 1), "
    assert f"{last}Sun 3 May 2026, time not set." in later
    assert later.endswith("No later race is in PitWall's schedule yet.")


def test_now_in_another_zone_is_read_in_utc() -> None:
    pacific = timezone(timedelta(hours=-8))
    note = calendar_note(datetime(2026, 11, 28, 9, 42, tzinfo=pacific), SEASON)

    assert note.startswith("Now: Sat 28 Nov 2026, 17:42 UTC.")


def test_no_rounds_give_no_note_and_a_naive_clock_is_refused() -> None:
    assert calendar_note(_at("2026-11-28T17:42:00Z"), []) is None
    with pytest.raises(ValueError):
        calendar_note(datetime(2026, 11, 28, 17, 42), SEASON)


def _write(folder: Path, season: int, rounds: list[dict]) -> None:
    data = {"season": season, "source": "test", "rounds": rounds}
    (folder / f"{season}.json").write_text(json.dumps(data))


def _race(day: str, start: str) -> dict:
    return {"name": "race", "date": day, "start": start}


def test_the_note_reads_last_this_and_next_seasons_files(tmp_path: Path) -> None:
    _write(
        tmp_path,
        2026,
        [
            {
                "round": 23,
                "race_name": "Abu Dhabi Grand Prix",
                "circuit_ref": "yas_marina",
                "sprint": False,
                "sessions": [_race("2026-12-06", "2026-12-06T13:00:00Z")],
            }
        ],
    )
    _write(
        tmp_path,
        2027,
        [
            {
                "round": 1,
                "race_name": "Australian Grand Prix",
                "circuit_ref": "albert_park",
                "sprint": False,
                "sessions": [_race("2027-03-07", "2027-03-07T04:00:00Z")],
            }
        ],
    )

    note = race_calendar_note(datetime(2027, 1, 15, 12, 0, tzinfo=UTC), tmp_path)

    assert "Last race: Abu Dhabi Grand Prix (2026, round 23 of 1)" in note
    assert "Next race weekend: Australian Grand Prix (2027, round 1 of 1):" in note


def test_an_unreadable_file_gives_no_note_and_is_logged_once(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    (tmp_path / "2026.json").write_text("{not json")

    for _ in range(3):
        assert race_calendar_note(datetime(2026, 11, 28, tzinfo=UTC), tmp_path) is None
    assert len([r for r in caplog.records if "2026" in r.getMessage()]) == 1


def test_one_unreadable_season_leaves_the_others(tmp_path: Path) -> None:
    (tmp_path / "2027.json").write_text("{not json")
    _write(
        tmp_path,
        2026,
        [
            {
                "round": 23,
                "race_name": "Abu Dhabi Grand Prix",
                "circuit_ref": "yas_marina",
                "sprint": False,
                "sessions": [_race("2026-12-06", "2026-12-06T13:00:00Z")],
            }
        ],
    )

    note = race_calendar_note(datetime(2026, 11, 28, tzinfo=UTC), tmp_path)

    assert "Next race weekend: Abu Dhabi Grand Prix (2026, round 23 of 1):" in note


def test_no_files_give_no_note(tmp_path: Path) -> None:
    assert race_calendar_note(datetime(2026, 11, 28, tzinfo=UTC), tmp_path) is None


def test_the_shipped_2026_file_gives_a_note() -> None:
    note = race_calendar_note(datetime(2026, 11, 28, 17, 42, tzinfo=UTC))

    assert note is not None
    assert "This race weekend: Qatar Grand Prix (2026, round" in note
