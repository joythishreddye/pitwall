"""GET /api/v1/seasons: every season, even past PostgREST's 1,000-row cap."""

from collections.abc import Iterator
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.routes import seasons as seasons_route
from app.main import app

ROW_CAP = 1000


class FakeRaces:
    """The races table, capping each response at 1,000 rows like PostgREST."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self._range: tuple[int, int] | None = None

    def table(self, name: str) -> "FakeRaces":
        assert name == "races"
        self._range = None
        return self

    def select(self, *_args, **_kwargs) -> "FakeRaces":
        return self

    def order(self, column: str, **_kwargs) -> "FakeRaces":
        assert column == "id"
        self.rows = sorted(self.rows, key=lambda r: r["id"])
        return self

    def range(self, start: int, end: int) -> "FakeRaces":
        self._range = (start, end)
        return self

    def execute(self) -> MagicMock:
        start, end = self._range or (0, len(self.rows) - 1)
        page = self.rows[start : end + 1][:ROW_CAP]
        return MagicMock(data=page)


@pytest.fixture
def races_db() -> Iterator[FakeRaces]:
    # 1,050 races: 1,000 modern ones first by id, then fifty from 1950.
    modern = [{"id": i, "season": 2018 + i % 9} for i in range(1, 1001)]
    old = [{"id": 1000 + i, "season": 1950} for i in range(1, 51)]
    db = FakeRaces(modern + old)
    app.dependency_overrides[seasons_route.get_db] = lambda: db
    yield db
    app.dependency_overrides.clear()


async def test_list_seasons_reads_past_the_row_cap(races_db: FakeRaces) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/seasons")

    assert response.status_code == 200
    seasons = {s["year"]: s["race_count"] for s in response.json()}
    assert seasons[1950] == 50
    assert sum(seasons.values()) == 1050
    assert list(seasons) == sorted(seasons, reverse=True)
