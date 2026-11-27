"""The ingest's lookups read every row, past the database's 1,000-row cap."""

from types import SimpleNamespace

from app.ingestion._helpers import build_lookup, build_race_lookup
from app.ingestion.fastf1_ingest import _build_driver_code_lookup

ROW_CAP = 1000  # PostgREST's most rows in one response


class _Query:
    """A query on one table that answers at most ROW_CAP rows, like PostgREST."""

    def __init__(self, rows: list[dict], log: list[str]) -> None:
        self.rows = rows
        self.log = log
        self.start = 0
        self.end: int | None = None

    def select(self, columns: str) -> "_Query":
        return self

    def order(self, column: str) -> "_Query":
        self.log.append(f"order {column}")
        return self

    @property
    def not_(self) -> "_Query":
        return self

    def is_(self, column: str, value: str) -> "_Query":
        # Only ever called as .not_.is_(column, "null"): keep the non-null rows
        self.rows = [r for r in self.rows if r.get(column) is not None]
        return self

    def limit(self, n: int) -> "_Query":
        self.end = n - 1
        return self

    def range(self, start: int, end: int) -> "_Query":
        self.start, self.end = start, end
        return self

    def execute(self) -> SimpleNamespace:
        stop = len(self.rows) if self.end is None else self.end + 1
        return SimpleNamespace(data=self.rows[self.start : stop][:ROW_CAP])


class _Client:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self.tables = tables
        self.log: list[str] = []

    def table(self, name: str) -> _Query:
        return _Query(self.tables[name], self.log)


def test_a_lookup_reads_every_row_past_the_row_cap() -> None:
    drivers = [{"id": i, "ref": f"driver_{i}"} for i in range(1, 2501)]
    client = _Client({"drivers": drivers})

    lookup = build_lookup(client, "drivers", "ref")

    assert len(lookup) == 2500
    assert lookup["driver_2500"] == 2500
    # Pages ordered on the unique column, so none overlap or skip rows
    assert set(client.log) == {"order id"}


def test_the_race_lookup_reads_every_season() -> None:
    # 1950 to 2026 is about 1,150 races once the f1db backfill (#18) is in
    races = [
        {"id": i, "season": 1950 + (i - 1) // 15, "round": (i - 1) % 15 + 1}
        for i in range(1, 1156)
    ]
    client = _Client({"races": races})

    lookup = build_race_lookup(client)

    assert len(lookup) == 1155
    assert lookup[(1950, 1)] == 1
    assert lookup[(2026, 15)] == 1155


def test_the_fastf1_driver_codes_read_every_driver() -> None:
    # Most drivers before 2005 have no code: only the coded ones count
    drivers = [
        {"id": i, "code": f"D{i:04d}" if i % 3 else None} for i in range(1, 2101)
    ]
    client = _Client({"drivers": drivers})

    lookup = _build_driver_code_lookup(client)

    assert len(lookup) == 1400
    assert lookup["D2099"] == 2099
    assert set(client.log) == {"order id"}
