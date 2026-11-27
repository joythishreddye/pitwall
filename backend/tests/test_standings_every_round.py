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


def _standing(sid: int, rnd: int, driver_id: int, position: int, points: float):
    return {
        "id": sid,
        "season": 2026,
        "round": rnd,
        "type": "driver",
        "entity_id": driver_id,
        "position": position,
        "points": points,
        "wins": 0,
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
            "standings": standings,
        }
    )


# The sprint gave RUS 8 and ANT 7, so after round 2 Russell is ahead of Hamilton
AFTER_ROUND_1 = [
    _standing(1, 1, ANT, 1, 25),
    _standing(2, 1, HAM, 2, 18),
    _standing(3, 1, RUS, 3, 12),
]
AFTER_ROUND_2 = [
    _standing(4, 2, ANT, 1, 57),
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
    _standing(4, 2, ANT, 1, 32),
    _standing(5, 2, RUS, 2, 20),
    _standing(6, 2, HAM, 3, 18),
]


def test_progression_falls_back_while_a_rounds_standings_lack_its_grand_prix() -> None:
    progression = get_standings_progression(
        2026, _season(AFTER_ROUND_1 + ROUND_2_SPRINT_ONLY), top=2
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


def test_ingest_fills_in_only_the_rounds_with_no_standings() -> None:
    # Round 1's driver standings are already stored; nothing else is
    stored = [
        {**_standing(1, 1, ANT, 1, 10), "type": "driver"},
        {**_standing(2, 1, RUS, 2, 9), "type": "driver"},
    ]
    db = _db({"standings": stored})
    http, fetched = _jolpica(latest=3)

    # Round 1 is also the last stored driver round and Jolpica has moved on,
    # so it's fetched again; round 2 is the only one missing
    assert _ingest(db, http, every_round=True) == 2 + 2 + 2 + 1 + 1 + 1
    assert fetched == [
        f"{BASE_URL}/2026/driverStandings.json",
        f"{BASE_URL}/2026/1/driverStandings.json",
        f"{BASE_URL}/2026/2/driverStandings.json",
        f"{BASE_URL}/2026/constructorStandings.json",
        f"{BASE_URL}/2026/1/constructorStandings.json",
        f"{BASE_URL}/2026/2/constructorStandings.json",
    ]
    rounds = {(r["type"], r["round"]) for r in stored}
    assert rounds == {
        ("driver", 1),
        ("driver", 2),
        ("driver", 3),
        ("constructor", 1),
        ("constructor", 2),
        ("constructor", 3),
    }

    # A second run finds every round stored and fetches only the latest
    http, fetched = _jolpica(latest=3)
    _ingest(db, http, every_round=True)
    assert len(fetched) == 2


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


def test_an_empty_refetch_also_holds_the_new_round_back() -> None:
    db = _db({"standings": []})
    _ingest(db, _after_round_2s_sprint(), every_round=False)

    http, _ = _jolpica(latest=3)
    serve = http.get.side_effect

    def round_2_empty(url: str, params: object = None) -> MagicMock:
        response = serve(url, params)
        if "/2026/2/" in url:
            body = response.json.return_value["MRData"]["StandingsTable"]
            body["StandingsLists"] = []
        return response

    http.get.side_effect = round_2_empty
    report = IngestReport()
    _ingest(db, http, every_round=False, report=report)

    assert {(kind, rnd) for kind, rnd, _ in _points(db)} == {
        ("driver", 2),
        ("constructor", 2),
    }
    assert report.problems == [
        "driver standings for 2026 round 2 failed: Jolpica sent no standings",
        "constructor standings for 2026 round 2 failed: Jolpica sent no standings",
    ]

    # The next run, with round 2 back, repairs it and stores round 3
    http, _ = _jolpica(latest=3)
    _ingest(db, http, every_round=False)
    points = _points(db)
    assert points[("driver", 2, ANT)] == 20
    assert points[("driver", 3, ANT)] == 30


def test_when_the_refetch_fails_the_new_round_waits_and_the_next_run_retries() -> None:
    db = _db({"standings": []})
    _ingest(db, _after_round_2s_sprint(), every_round=False)

    http, fetched = _jolpica(latest=3)
    serve = http.get.side_effect

    def round_2_down(url: str, params: object = None) -> MagicMock:
        if "/2026/2/" in url:
            fetched.append(url)
            raise RuntimeError("Jolpica is down")
        return serve(url, params)

    http.get.side_effect = round_2_down
    report = IngestReport()
    _ingest(db, http, every_round=False, report=report)

    # Round 3 isn't stored, so round 2 stays the latest stored round
    assert {(kind, rnd) for kind, rnd, _ in _points(db)} == {
        ("driver", 2),
        ("constructor", 2),
    }
    assert report.problems == [
        "driver standings for 2026 round 2 failed: Jolpica is down",
        "constructor standings for 2026 round 2 failed: Jolpica is down",
    ]

    http, _ = _jolpica(latest=3)
    _ingest(db, http, every_round=False)
    points = _points(db)
    assert points[("driver", 2, ANT)] == 20
    assert points[("driver", 3, ANT)] == 30
