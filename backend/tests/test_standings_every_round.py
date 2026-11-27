"""Standings after every round: the Jolpica fill and the points progression."""

from unittest.mock import MagicMock

import pytest

from app.api.routes.standings import get_standings, get_standings_progression
from app.ingestion.jolpica_ingest import BASE_URL, IngestReport, ingest_standings


class _Query:
    """Just enough of a PostgREST query to run on dict rows."""

    def __init__(self, table: "_Table", rows: list[dict]) -> None:
        self.table, self.rows = table, rows

    def select(self, *_args: object, **_kwargs: object) -> "_Query":
        return self

    def eq(self, column: str, value: object) -> "_Query":
        return _Query(self.table, [r for r in self.rows if r[column] == value])

    def in_(self, column: str, values: list) -> "_Query":
        return _Query(self.table, [r for r in self.rows if r[column] in values])

    def order(self, column: str, desc: bool = False) -> "_Query":
        rows = sorted(self.rows, key=lambda r: r[column], reverse=desc)
        return _Query(self.table, rows)

    def range(self, start: int, end: int) -> "_Query":
        return _Query(self.table, self.rows[start : end + 1])

    def limit(self, count: int) -> "_Query":
        return _Query(self.table, self.rows[:count])

    def upsert(self, chunk: list[dict], on_conflict: str) -> "_Query":
        self.table.upsert(chunk, on_conflict.split(","))
        return self

    def execute(self) -> MagicMock:
        return MagicMock(data=self.rows)


class _Table:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def upsert(self, chunk: list[dict], keys: list[str]) -> None:
        for row in chunk:
            key = tuple(row[k] for k in keys)
            self.rows[:] = [r for r in self.rows if tuple(r[k] for k in keys) != key]
            self.rows.append({"id": len(self.rows) + 1000, **row})


def _db(tables: dict[str, list[dict]]) -> MagicMock:
    stores = {name: _Table(rows) for name, rows in tables.items()}
    db = MagicMock()
    db.table.side_effect = lambda name: _Query(stores[name], stores[name].rows)
    return db


# ── The progression ──────────────────────────────────────────────

ANT, RUS, HAM = 3, 2, 1
MERCEDES = 7


def _result(rid: int, race_id: int, driver_id: int, points: float) -> dict:
    return {
        "id": rid,
        "race_id": race_id,
        "driver_id": driver_id,
        "points": points,
        "constructors": {
            "ref": "ferrari" if driver_id == HAM else "mercedes",
            "name": "Ferrari" if driver_id == HAM else "Mercedes",
        },
    }


def _standing(
    sid: int, rnd: int, driver_id: int, position: int, points: float, wins: int = 0
):
    return {
        "id": sid,
        "season": 2026,
        "round": rnd,
        "type": "driver",
        "entity_id": driver_id,
        "position": position,
        "points": points,
        "wins": wins,
    }


def _driver(did: int, ref: str, forename: str, surname: str) -> dict:
    return {
        "id": did,
        "ref": ref,
        "code": surname[:3].upper(),
        "forename": forename,
        "surname": surname,
        "nationality": None,
    }


def _season(standings: list[dict]) -> MagicMock:
    """Two rounds; round 2 is a sprint weekend that Russell's sprint win swings."""
    return _db(
        {
            "races": [
                {"id": 11, "season": 2026, "round": 1},
                {"id": 12, "season": 2026, "round": 2},
            ],
            # Grand Prix points only: ANT 25+25, HAM 18+12, RUS 12+15
            "race_results": [
                _result(1, 11, ANT, 25),
                _result(2, 11, HAM, 18),
                _result(3, 11, RUS, 12),
                _result(4, 12, ANT, 25),
                _result(5, 12, RUS, 15),
                _result(6, 12, HAM, 12),
            ],
            "drivers": [
                _driver(ANT, "antonelli", "Kimi", "Antonelli"),
                _driver(RUS, "russell", "George", "Russell"),
                _driver(HAM, "hamilton", "Lewis", "Hamilton"),
            ],
            "constructors": [
                {"id": MERCEDES, "ref": "mercedes", "name": "Mercedes"},
            ],
            "standings": standings,
        }
    )


# The sprint gave RUS 8 and ANT 7, so after round 2 Russell is ahead of Hamilton
# Antonelli won both Grands Prix: the wins add up to the round
AFTER_ROUND_1 = [
    _standing(1, 1, ANT, 1, 25, wins=1),
    _standing(2, 1, HAM, 2, 18),
    _standing(3, 1, RUS, 3, 12),
]
AFTER_ROUND_2 = [
    _standing(4, 2, ANT, 1, 57, wins=2),
    _standing(5, 2, RUS, 2, 35),
    _standing(6, 2, HAM, 3, 30),
]


def test_progression_takes_points_and_the_top_n_from_every_round_standings() -> None:
    progression = get_standings_progression(
        2026, _season(AFTER_ROUND_1 + AFTER_ROUND_2), top=2
    )

    # Race sums alone would pick Hamilton (30) over Russell (27)
    assert [p.driver_ref for p in progression] == ["antonelli", "russell"]
    assert progression[0].rounds == [1, 2]
    assert progression[0].points == [25, 57]
    assert progression[1].points == [12, 35]
    # Each driver's last point is his standings total
    latest = {s["entity_id"]: s["points"] for s in AFTER_ROUND_2}
    by_ref = {"antonelli": ANT, "russell": RUS}
    for p in progression:
        assert p.points[-1] == latest[by_ref[p.driver_ref]]


def test_progression_falls_back_to_race_results_while_a_round_has_no_standings() -> (
    None
):
    # Today's ingest stores only the latest round
    progression = get_standings_progression(2026, _season(AFTER_ROUND_2), top=2)

    assert [p.driver_ref for p in progression] == ["antonelli", "hamilton"]
    assert progression[0].points == [25, 50]
    assert progression[1].points == [18, 30]
    assert progression[1].constructor_ref == "ferrari"


# Round 2's results are in, but its standings were stored after the sprint:
# the sprint's points only (ANT 25+7, RUS 12+8, HAM 18+0)
ROUND_2_SPRINT_ONLY = [
    _standing(4, 2, ANT, 1, 32, wins=1),
    _standing(5, 2, RUS, 2, 20),
    _standing(6, 2, HAM, 3, 18),
]
# The same, for drivers whose earlier sprint points (made up here) already put
# each one above his Grand Prix points to round 2: only the wins show it's stale
ROUND_2_SPRINT_ONLY_MASKED = [
    _standing(4, 2, ANT, 1, 60, wins=1),
    _standing(5, 2, RUS, 2, 31),
    _standing(6, 2, HAM, 3, 30),
]


@pytest.mark.parametrize(
    "round_2",
    [ROUND_2_SPRINT_ONLY, ROUND_2_SPRINT_ONLY_MASKED],
    ids=["short_on_points", "points_masked_by_sprints"],
)
def test_progression_falls_back_while_a_rounds_standings_lack_its_grand_prix(
    round_2: list[dict],
) -> None:
    progression = get_standings_progression(
        2026, _season(AFTER_ROUND_1 + round_2), top=2
    )

    # Race sums, as with no standings: never 32 for Antonelli after round 2
    assert [p.driver_ref for p in progression] == ["antonelli", "hamilton"]
    assert progression[0].points == [25, 50]
    assert progression[1].points == [18, 30]


@pytest.mark.parametrize(
    "standings",
    [AFTER_ROUND_2, AFTER_ROUND_1 + AFTER_ROUND_2],
    ids=["latest_round_only", "every_round"],
)
@pytest.mark.parametrize("kind", ["driver", None])
def test_the_standings_endpoint_still_reads_the_latest_round(
    standings: list[dict], kind: str | None
) -> None:
    # Today's table holds only the latest round; after the fill it holds every round
    response = get_standings(2026, _season(standings), type=kind)

    assert response.round == 2
    assert [(e.driver_ref, e.points) for e in response.driver_standings] == [
        ("antonelli", 57),
        ("russell", 35),
        ("hamilton", 30),
    ]
    if kind is None:
        assert response.constructor_standings == []
    else:
        assert response.constructor_standings is None


def _constructor(sid: int, rnd: int, points: float) -> dict:
    return {
        **_standing(sid, rnd, MERCEDES, 1, points, wins=rnd),
        "type": "constructor",
    }


@pytest.mark.parametrize(
    ("kind", "answer"), [(None, 1), ("driver", 1), ("constructor", 2)]
)
def test_both_tables_answer_the_round_both_kinds_have(
    kind: str | None, answer: int
) -> None:
    # A refresh held the driver standings back at round 1 (their repair fetch
    # failed) while the constructor standings moved on to round 2
    constructors = [_constructor(7, 1, 37), _constructor(8, 2, 92)]
    response = get_standings(2026, _season(AFTER_ROUND_1 + constructors), type=kind)

    assert response.round == answer
    if kind != "constructor":
        assert [e.points for e in response.driver_standings] == [25, 18, 12]
    if kind != "driver":
        points = 37 if answer == 1 else 92
        assert [e.points for e in response.constructor_standings] == [points]


def test_both_kinds_at_the_same_round_answer_it_whole() -> None:
    # The usual shape: the latest refresh stored both kinds after round 2
    standings = [*AFTER_ROUND_1, *AFTER_ROUND_2, _constructor(7, 1, 37)]
    response = get_standings(2026, _season([*standings, _constructor(8, 2, 92)]))

    assert response.round == 2
    assert [e.points for e in response.driver_standings] == [57, 35, 30]
    assert [e.points for e in response.constructor_standings] == [92]


def test_a_kind_held_back_at_a_round_the_other_skipped_answers_as_today() -> None:
    # Two refreshes each held a different kind back: drivers have rounds 1 and
    # 3, constructors 1 and 2, so the lagging kind's round 2 has no drivers
    after_round_3 = [{**row, "id": row["id"] + 10, "round": 3} for row in AFTER_ROUND_2]
    standings = [*AFTER_ROUND_1, *after_round_3, _constructor(7, 1, 37)]
    response = get_standings(2026, _season([*standings, _constructor(8, 2, 92)]))

    # The latest round, as before: drivers whole, constructors empty
    assert response.round == 3
    assert [e.points for e in response.driver_standings] == [57, 35, 30]
    assert response.constructor_standings == []


def test_when_the_kinds_share_no_latest_round_both_tables_answer_as_today() -> None:
    # Latest-round-only data: drivers stored after round 2, constructors only
    # after round 1 (their round 2 fetch failed), so no round has both
    response = get_standings(2026, _season([*AFTER_ROUND_2, _constructor(7, 1, 37)]))

    assert response.round == 2
    assert [e.points for e in response.driver_standings] == [57, 35, 30]
    assert response.constructor_standings == []


# ── The Jolpica fill ─────────────────────────────────────────────


def _jolpica_standings(kind: str, rnd: int, refs: list[str]) -> dict:
    list_key, entity_key, id_key = {
        "driver": ("DriverStandings", "Driver", "driverId"),
        "constructor": ("ConstructorStandings", "Constructor", "constructorId"),
    }[kind]
    entries = [
        {
            "position": str(i + 1),
            "points": str(10 * rnd - i),
            # Jolpica counts Grand Prix wins only: one per round so far
            "wins": str(rnd if i == 0 else 0),
            entity_key: {id_key: ref},
        }
        for i, ref in enumerate(refs)
    ]
    return {
        "MRData": {
            "StandingsTable": {
                "season": "2026",
                "StandingsLists": [
                    {"season": "2026", "round": str(rnd), list_key: entries}
                ],
            }
        }
    }


def _jolpica(latest: int) -> tuple[MagicMock, list[str]]:
    """A Jolpica client whose season has run ``latest`` rounds; logs each URL."""
    fetched: list[str] = []

    def get(url: str, params: object = None) -> MagicMock:
        fetched.append(url)
        path = url.removeprefix(f"{BASE_URL}/2026/").removesuffix(".json")
        rnd_text, _, name = path.rpartition("/")
        rnd = int(rnd_text) if rnd_text else latest
        kind = "driver" if name == "driverStandings" else "constructor"
        refs = ["antonelli", "russell"] if kind == "driver" else ["mercedes"]
        response = MagicMock(status_code=200)
        response.json.return_value = _jolpica_standings(kind, rnd, refs)
        return response

    http = MagicMock()
    http.get.side_effect = get
    return http, fetched


def _ingest(
    db: MagicMock,
    http: MagicMock,
    every_round: bool,
    report: IngestReport | None = None,
) -> int:
    return ingest_standings(
        db,
        http,
        MagicMock(),
        [2026],
        {"antonelli": ANT, "russell": RUS},
        {"mercedes": 7},
        every_round=every_round,
        report=report,
    )


SPRINT_ONLY = 5  # round 2's Grand Prix points Jolpica hasn't added yet


def _after_round_2s_sprint() -> MagicMock:
    """Jolpica on a sprint Saturday: round 2's standings hold its sprint's
    points but not yet its Grand Prix's, nor its win."""
    http, _ = _jolpica(latest=2)
    serve = http.get.side_effect

    def get(url: str, params: object = None) -> MagicMock:
        response = serve(url, params)
        if url.endswith(
            ("/2026/driverStandings.json", "/2026/constructorStandings.json")
        ):
            body = response.json.return_value["MRData"]["StandingsTable"]
            standings = body["StandingsLists"][0]
            entries = (
                standings.get("DriverStandings") or standings["ConstructorStandings"]
            )
            for entry in entries:
                entry["points"] = str(float(entry["points"]) - SPRINT_ONLY)
            entries[0]["wins"] = "1"
        return response

    http.get.side_effect = get
    return http


def _points(db: MagicMock) -> dict[tuple[str, int, int], float]:
    return {
        (r["type"], r["round"], r["entity_id"]): r["points"]
        for r in db.table("standings").rows
    }


def test_ingest_stores_only_the_latest_standings_by_default() -> None:
    db = _db({"standings": []})
    http, fetched = _jolpica(latest=3)

    assert _ingest(db, http, every_round=False) == 3
    assert fetched == [
        f"{BASE_URL}/2026/driverStandings.json",
        f"{BASE_URL}/2026/constructorStandings.json",
    ]


EVERY_ROUND_URLS = [
    f"{BASE_URL}/2026/driverStandings.json",
    f"{BASE_URL}/2026/1/driverStandings.json",
    f"{BASE_URL}/2026/2/driverStandings.json",
    f"{BASE_URL}/2026/constructorStandings.json",
    f"{BASE_URL}/2026/1/constructorStandings.json",
    f"{BASE_URL}/2026/2/constructorStandings.json",
]


def test_the_fill_reads_every_earlier_round_on_each_run() -> None:
    # Round 1's driver standings are already stored; nothing else is
    stored = [
        {**_standing(1, 1, ANT, 1, 10), "type": "driver"},
        {**_standing(2, 1, RUS, 2, 9), "type": "driver"},
    ]
    db = _db({"standings": stored})
    http, fetched = _jolpica(latest=3)

    assert _ingest(db, http, every_round=True) == 2 + 2 + 2 + 1 + 1 + 1
    assert fetched == EVERY_ROUND_URLS
    rounds = {(r["type"], r["round"]) for r in stored}
    assert rounds == {
        ("driver", 1),
        ("driver", 2),
        ("driver", 3),
        ("constructor", 1),
        ("constructor", 2),
        ("constructor", 3),
    }

    # A second run reads every round again: nothing stored is trusted
    http, fetched = _jolpica(latest=3)
    _ingest(db, http, every_round=True)
    assert fetched == EVERY_ROUND_URLS


def test_the_fill_overwrites_an_older_round_stored_before_its_grand_prix() -> None:
    # An older run stored round 2 on its sprint Saturday (its win missing), and
    # later runs stored round 3
    stored = [
        _standing(1, 1, ANT, 1, 10, wins=1),
        _standing(2, 2, ANT, 1, 15, wins=1),
        _standing(3, 3, ANT, 1, 30, wins=3),
    ]
    db = _db({"standings": stored})
    http, _ = _jolpica(latest=4)

    _ingest(db, http, every_round=True)

    assert _points(db)[("driver", 2, ANT)] == 20


def test_an_older_round_without_someone_is_stored_reported_and_filled_in_later() -> (
    None
):
    db = _db({"standings": []})
    http, _ = _jolpica(latest=3)
    report = IngestReport()

    # Russell isn't in the database yet
    ingest_standings(
        db,
        http,
        MagicMock(),
        [2026],
        {"antonelli": ANT},
        {"mercedes": 7},
        every_round=True,
        report=report,
    )

    assert set(_points(db)) == {
        ("driver", 1, ANT),
        ("driver", 2, ANT),
        ("driver", 3, ANT),
        ("constructor", 1, 7),
        ("constructor", 2, 7),
        ("constructor", 3, 7),
    }
    assert report.problems == [
        f"driver standings for 2026 round {rnd} are stored short: 1 driver in "
        "Jolpica's standings isn't in the database"
        for rnd in (3, 1, 2)
    ]

    # Once he is, the next run fills him in on every round
    http, _ = _jolpica(latest=3)
    _ingest(db, http, every_round=True)
    assert _points(db)[("driver", 1, RUS)] == 9
    assert _points(db)[("driver", 2, RUS)] == 19
    assert _points(db)[("driver", 3, RUS)] == 29


def test_an_older_round_still_short_of_its_grand_prix_is_stored_as_jolpica_has_it() -> (
    None
):
    # A Grand Prix cancelled after its sprint never adds its win, so its round
    # must not fail every refresh
    db = _db({"standings": []})
    http, _ = _jolpica(latest=3)
    serve = http.get.side_effect

    def round_2_without_its_win(url: str, params: object = None) -> MagicMock:
        response = serve(url, params)
        if "/2026/2/" in url:
            body = response.json.return_value["MRData"]["StandingsTable"]
            standings = body["StandingsLists"][0]
            entries = (
                standings.get("DriverStandings") or standings["ConstructorStandings"]
            )
            entries[0]["wins"] = "1"
        return response

    http.get.side_effect = round_2_without_its_win
    report = IngestReport()
    _ingest(db, http, every_round=True, report=report)

    assert {(kind, rnd) for kind, rnd, _ in _points(db)} == {
        (kind, rnd) for kind in ("driver", "constructor") for rnd in (1, 2, 3)
    }
    assert report.problems == []


def test_latest_standings_without_someone_are_stored_but_reported() -> None:
    db = _db({"standings": []})
    http, _ = _jolpica(latest=3)
    report = IngestReport()

    ingest_standings(
        db,
        http,
        MagicMock(),
        [2026],
        {"antonelli": ANT},
        {"mercedes": 7},
        report=report,
    )

    # The table stays up with who is known, and the refresh exits 1
    assert set(_points(db)) == {("driver", 3, ANT), ("constructor", 3, 7)}
    assert report.problems == [
        "driver standings for 2026 round 3 are stored short: 1 driver in "
        "Jolpica's standings isn't in the database"
    ]

    # Once he's in the database, the next run stores him
    http, _ = _jolpica(latest=3)
    _ingest(db, http, every_round=False)
    assert _points(db)[("driver", 3, RUS)] == 29


def test_a_round_that_fails_doesnt_stop_the_later_ones() -> None:
    db = _db({"standings": []})
    http, fetched = _jolpica(latest=3)
    serve = http.get.side_effect

    def round_1_down(url: str, params: object = None) -> MagicMock:
        if "/2026/1/" in url:
            fetched.append(url)
            raise RuntimeError("Jolpica is down")
        return serve(url, params)

    http.get.side_effect = round_1_down
    _ingest(db, http, every_round=True)

    stored = {(r["type"], r["round"]) for r in db.table("standings").rows}
    assert stored == {
        ("driver", 2),
        ("driver", 3),
        ("constructor", 2),
        ("constructor", 3),
    }
    assert f"{BASE_URL}/2026/2/constructorStandings.json" in fetched


@pytest.mark.parametrize("every_round", [False, True])
def test_a_round_stored_after_its_sprint_is_fetched_again_once_jolpica_moves_on(
    every_round: bool,
) -> None:
    db = _db({"standings": []})
    _ingest(db, _after_round_2s_sprint(), every_round=every_round)
    assert _points(db)[("driver", 2, ANT)] == 20 - SPRINT_ONLY

    # The next refresh comes after round 3, so round 2 is no longer the latest
    http, fetched = _jolpica(latest=3)
    _ingest(db, http, every_round=every_round)

    assert f"{BASE_URL}/2026/2/driverStandings.json" in fetched
    points = _points(db)
    assert points[("driver", 2, ANT)] == 20  # the Grand Prix's points are in
    assert points[("driver", 3, ANT)] == 30


def _sprint_stored_then(serve_round_2) -> tuple[MagicMock, IngestReport]:
    """Store round 2 on its sprint Saturday, then run a latest-only refresh
    after round 3 whose fetch of round 2 goes through ``serve_round_2``."""
    db = _db({"standings": []})
    _ingest(db, _after_round_2s_sprint(), every_round=False)

    http, _ = _jolpica(latest=3)
    serve = http.get.side_effect

    def get(url: str, params: object = None) -> MagicMock:
        if "/2026/2/" in url:
            return serve_round_2(url, params, serve)
        return serve(url, params)

    http.get.side_effect = get
    report = IngestReport()
    _ingest(db, http, every_round=False, report=report)
    return db, report


def test_an_empty_refetch_is_reported_and_the_new_round_is_stored() -> None:
    def empty(url: str, params: object, serve) -> MagicMock:
        response = serve(url, params)
        response.json.return_value["MRData"]["StandingsTable"]["StandingsLists"] = []
        return response

    db, report = _sprint_stored_then(empty)

    assert _points(db)[("driver", 3, ANT)] == 30
    assert _points(db)[("driver", 2, ANT)] == 20 - SPRINT_ONLY
    assert report.problems == [
        f"{kind} standings for 2026 round 2 failed: Jolpica sent no standings"
        for kind in ("driver", "constructor")
    ]


def test_a_refetch_answered_with_another_round_is_reported_and_not_stored() -> None:
    def as_round_3(url: str, params: object, serve) -> MagicMock:
        return serve(url.replace("/2026/2/", "/2026/3/"), params)

    db, report = _sprint_stored_then(as_round_3)

    assert _points(db)[("driver", 2, ANT)] == 20 - SPRINT_ONLY
    assert _points(db)[("driver", 3, ANT)] == 30
    assert report.problems == [
        f"{kind} standings for 2026 round 2 failed: Jolpica sent round 3's "
        "standings, not round 2's"
        for kind in ("driver", "constructor")
    ]


def test_a_failed_refetch_is_reported_and_an_every_round_run_repairs_it() -> None:
    def down(url: str, params: object, serve) -> MagicMock:
        raise RuntimeError("Jolpica is down")

    db, report = _sprint_stored_then(down)

    # The new round is stored anyway, so a latest-only run won't try round 2
    # again; an every-round run (the refresh command's flag) does
    assert _points(db)[("driver", 3, ANT)] == 30
    assert report.problems == [
        f"{kind} standings for 2026 round 2 failed: Jolpica is down"
        for kind in ("driver", "constructor")
    ]

    http, _ = _jolpica(latest=3)
    _ingest(db, http, every_round=True)
    assert _points(db)[("driver", 2, ANT)] == 20
