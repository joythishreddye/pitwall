"""The chat's title note: whether the drivers' title is decided, from brief
001's title maths and the season's schedule."""

from datetime import datetime
from unittest.mock import MagicMock

from app.api.routes import chat as chat_route
from app.rag.title_note import title_note
from app.schedule import RoundSchedule, Session


def _at(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def _round(rnd: int, race: str, sprint: bool = False) -> RoundSchedule:
    start = _at(race)
    race = Session("race", start.date(), start)
    return RoundSchedule(2026, rnd, f"Round {rnd}", "ref", sprint, (race,))


SEASON = [
    _round(20, "2026-11-08T17:00:00Z"),
    _round(21, "2026-11-22T04:00:00Z"),
    _round(22, "2026-11-29T16:00:00Z"),
    _round(23, "2026-12-06T13:00:00Z"),
]


def test_a_lead_bigger_than_the_points_left_is_decided() -> None:
    note = title_note(
        2026, 21, [("Kimi Antonelli", 402), ("Max Verstappen", 304)], SEASON, True
    )

    assert note == (
        "The 2026 drivers' title is decided: Kimi Antonelli leads Max Verstappen "
        "by 98 points with 2 races left, worth 50 points at most (no sprints), "
        "so Kimi Antonelli is the 2026 World Champion."
    )


def test_a_lead_the_points_left_can_close_is_still_open() -> None:
    note = title_note(
        2026, 20, [("Kimi Antonelli", 390), ("Max Verstappen", 340)], SEASON, True
    )

    assert note == (
        "The 2026 drivers' title is still open: Kimi Antonelli leads Max Verstappen "
        "by 50 points with 3 races left, worth 75 points at most (no sprints)."
    )


def test_a_lead_equal_to_the_points_left_is_still_open() -> None:
    # A tie at the end goes to countback, which he could lose
    note = title_note(2026, 21, [("A", 354), ("B", 304)], SEASON, True)

    assert note is not None
    assert "is still open" in note


def test_sprints_left_add_their_points() -> None:
    season = [*SEASON[:3], _round(23, "2026-12-06T13:00:00Z", sprint=True)]

    # 56 ahead: decided with no sprint left (50), open with one (58)
    note = title_note(2026, 21, [("A", 360), ("B", 304)], season, True)

    assert note is not None
    assert note.startswith("The 2026 drivers' title is still open: A leads B by 56")
    assert "with 2 races left, worth 58 points at most (1 sprint)" in note


def test_after_the_last_race_the_leader_is_champion() -> None:
    note = title_note(
        2026,
        23,
        [("Kimi Antonelli", 440), ("Max Verstappen", 340)],
        SEASON,
        True,
    )

    assert note == (
        "The 2026 season is over: Kimi Antonelli is the 2026 World Champion."
    )


def test_the_last_rounds_sprint_alone_is_not_the_end() -> None:
    # Standings stored after the last round's sprint, before its Grand Prix
    season = [*SEASON[:3], _round(23, "2026-12-06T13:00:00Z", sprint=True)]

    note = title_note(2026, 23, [("A", 400), ("B", 399)], season, False)

    assert note == (
        "The 2026 drivers' title is still open: A leads B by 1 points "
        "with 1 race left, worth 25 points at most (no sprints)."
    )


def test_level_on_points_is_said_so() -> None:
    note = title_note(2026, 20, [("A", 300), ("B", 300)], SEASON, True)

    assert note == (
        "The 2026 drivers' title is still open: A and B are level on 300 points "
        "with 3 races left, worth 75 points at most (no sprints)."
    )


def test_standings_stored_after_a_sprint_keep_its_grand_prix_left() -> None:
    # Standings after round 22's sprint, before its race: round 22's race still
    # counts (its sprint is already in the points)
    season = [*SEASON[:2], _round(22, "2026-11-29T16:00:00Z", sprint=True), SEASON[3]]

    note = title_note(2026, 22, [("A", 400), ("B", 340)], season, False)

    assert note is not None
    assert "with 2 races left, worth 50 points at most (no sprints)" in note
    # Once its Grand Prix result is in, only round 23 is left
    after = title_note(2026, 22, [("A", 400), ("B", 340)], season, True)
    assert after is not None
    assert "is decided" in after


def test_half_points_keep_their_half() -> None:
    note = title_note(2026, 20, [("A", 312.5), ("B", 300)], SEASON, True)

    assert note is not None
    assert "by 12.5 points" in note


def test_no_note_without_a_schedule_round_or_a_second_driver() -> None:
    standings = [("A", 402), ("B", 304)]
    assert title_note(2026, 21, standings, [], True) is None
    # A schedule that doesn't list the standings' round is stale
    assert title_note(2026, 24, standings, SEASON, True) is None
    assert title_note(2026, 21, [("A", 402)], SEASON, True) is None


class _Table:
    """One table query: eq and in filters, order, limit."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.filters: list[tuple[str, set]] = []
        self.sort: tuple[str, bool] | None = None
        self.most: int | None = None

    def select(self, *_args, **_kwargs) -> "_Table":
        return self

    def eq(self, column: str, value: object) -> "_Table":
        self.filters.append((column, {value}))
        return self

    def in_(self, column: str, values: list) -> "_Table":
        self.filters.append((column, set(values)))
        return self

    def order(self, column: str, desc: bool = False) -> "_Table":
        self.sort = (column, desc)
        return self

    def limit(self, most: int) -> "_Table":
        self.most = most
        return self

    def execute(self) -> MagicMock:
        rows = [r for r in self.rows if all(r.get(c) in v for c, v in self.filters)]
        if self.sort is not None:
            rows.sort(key=lambda r: r[self.sort[0]], reverse=self.sort[1])
        return MagicMock(data=rows[: self.most] if self.most else rows)


class _DB:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self.tables = tables

    def table(self, name: str) -> _Table:
        return _Table(self.tables[name])


def _chat_db(raced: bool) -> _DB:
    """2026 after round 21 (Las Vegas): 25 drivers, 402 to 304 at the top."""
    points = [402, 304, *range(250, 0, -11)][:25]
    points += [0] * (25 - len(points))
    standings = [
        {
            "type": "driver",
            "season": 2026,
            "round": 21,
            "entity_id": i,
            "position": i,
            "points": pts,
            "wins": 0,
        }
        for i, pts in enumerate(points, start=1)
    ]
    return _DB(
        {
            "standings": standings,
            "drivers": [
                {"id": i, "forename": "Driver", "surname": str(i), "code": None}
                for i in range(1, 26)
            ],
            "races": [{"id": 170, "season": 2026, "round": 21}],
            "race_results": [{"id": 1, "race_id": 170}] if raced else [],
        }
    )


def test_the_chat_sees_every_driver_and_the_title_note() -> None:
    context = chat_route._fetch_current_standings_sync(_chat_db(raced=True))

    lines = context.splitlines()
    assert lines[0] == "Season 2026, Round 21:"
    assert len(lines) == 1 + 25 + 1
    assert lines[25].startswith("P25. Driver 25")
    # The shipped 2026 schedule: Qatar and Abu Dhabi left, neither a sprint
    assert lines[-1] == (
        "The 2026 drivers' title is decided: Driver 1 leads Driver 2 by 98 points "
        "with 2 races left, worth 50 points at most (no sprints), "
        "so Driver 1 is the 2026 World Champion."
    )


def test_standings_without_their_grand_prix_count_it_as_left() -> None:
    context = chat_route._fetch_current_standings_sync(_chat_db(raced=False))

    assert "by 98 points with 3 races left, worth 75 points at most" in context
