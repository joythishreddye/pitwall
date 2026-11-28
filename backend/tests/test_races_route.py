"""GET /api/v1/races/{id}/laps: every lap of a race, past PostgREST's 1,000-row
cap (a full race is about 20 drivers x 57 laps)."""

from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.routes import races as races_route
from app.main import app

ROW_CAP = 1000
RACE_ID = 170
DRIVERS = 20
LAPS = 57


class FakeTable:
    """One table query: filters, orders, a range or limit, and PostgREST's cap
    of 1,000 rows per response."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.filters: list[tuple[str, object]] = []
        self.orders: list[tuple[str, bool]] = []
        self.window: tuple[int, int] | None = None
        self.most: int | None = None

    def select(self, *_args, **_kwargs) -> "FakeTable":
        return self

    def eq(self, column: str, value: object) -> "FakeTable":
        self.filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeTable":
        self.orders.append((column, desc))
        return self

    def limit(self, most: int) -> "FakeTable":
        self.most = most
        return self

    def range(self, start: int, end: int) -> "FakeTable":
        self.window = (start, end)
        return self

    def execute(self) -> MagicMock:
        rows = [r for r in self.rows if all(r[c] == v for c, v in self.filters)]
        for column, desc in reversed(self.orders):
            rows.sort(key=lambda r: r[column], reverse=desc)
        if self.window is not None:
            rows = rows[self.window[0] : self.window[1] + 1]
        if self.most is not None:
            rows = rows[: self.most]
        return MagicMock(data=rows[:ROW_CAP])


class FakeDB:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self.tables = tables

    def table(self, name: str) -> FakeTable:
        return FakeTable(self.tables[name])


def _driver(driver_id: int) -> dict:
    return {
        "id": driver_id,
        "ref": f"driver_{driver_id}",
        "forename": "Test",
        "surname": f"Driver {driver_id}",
    }


@pytest.fixture
def race_db() -> Iterator[FakeDB]:
    laps = [
        {
            "race_id": RACE_ID,
            "driver_id": driver_id,
            "lap_number": lap,
            "time_millis": 90_000 + lap,
            "drivers": _driver(driver_id),
        }
        # Stored in lap order, as an ingest writes them, not driver order
        for lap in range(1, LAPS + 1)
        for driver_id in range(1, DRIVERS + 1)
    ]
    db = FakeDB(
        {
            "races": [{"id": RACE_ID}],
            "drivers": [_driver(i) for i in range(1, DRIVERS + 1)],
            "lap_summaries": laps,
        }
    )
    app.dependency_overrides[races_route.get_db] = lambda: db
    yield db
    app.dependency_overrides.clear()


async def _get(path: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


async def test_race_laps_read_past_the_row_cap(race_db: FakeDB) -> None:
    response = await _get(f"/api/v1/races/{RACE_ID}/laps")

    assert response.status_code == 200
    drivers = response.json()
    assert [d["driver"]["id"] for d in drivers] == list(range(1, DRIVERS + 1))
    for entry in drivers:
        assert [lap["lap_number"] for lap in entry["laps"]] == list(range(1, LAPS + 1))


async def test_race_laps_for_one_driver(race_db: FakeDB) -> None:
    response = await _get(f"/api/v1/races/{RACE_ID}/laps?driver_ref=driver_20")

    assert response.status_code == 200
    [entry] = response.json()
    assert entry["driver"]["ref"] == "driver_20"
    assert len(entry["laps"]) == LAPS


async def test_race_laps_404_for_an_unknown_race_or_driver(race_db: FakeDB) -> None:
    assert (await _get("/api/v1/races/999/laps")).status_code == 404
    unknown = await _get(f"/api/v1/races/{RACE_ID}/laps?driver_ref=nobody")
    assert unknown.status_code == 404
