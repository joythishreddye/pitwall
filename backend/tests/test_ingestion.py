"""Tests for ingestion helpers and field mapping."""

from unittest.mock import MagicMock

from app.ingestion._helpers import (
    RateLimiter,
    batch_upsert,
    safe_float,
    safe_int,
)
from app.ingestion.jolpica_ingest import (
    _map_circuit,
    _map_constructor,
    _map_driver,
    _map_result,
)

# ── safe_int / safe_float ────────────────────────────────────────


def test_safe_int_valid():
    assert safe_int("42") == 42
    assert safe_int(7) == 7


def test_safe_int_none_and_invalid():
    assert safe_int(None) is None
    assert safe_int("abc") is None
    assert safe_int(None, 0) == 0


def test_safe_float_valid():
    assert safe_float("3.14") == 3.14
    assert safe_float(2) == 2.0


def test_safe_float_none_and_invalid():
    assert safe_float(None) is None
    assert safe_float("abc") is None


# ── RateLimiter ──────────────────────────────────────────────────


def test_rate_limiter_allows_under_limit():
    rl = RateLimiter(max_requests=5, window_seconds=60)
    for _ in range(5):
        rl.wait_if_needed()
    assert len(rl._timestamps) == 5


# ── batch_upsert ─────────────────────────────────────────────────


def test_batch_upsert_empty():
    mock_sb = MagicMock()
    assert batch_upsert(mock_sb, "test", [], "id") == 0
    mock_sb.table.assert_not_called()


def test_batch_upsert_chunks():
    mock_sb = MagicMock()
    mock_sb.table.return_value.upsert.return_value.execute.return_value = None
    rows = [{"id": i} for i in range(3)]
    count = batch_upsert(mock_sb, "test", rows, "id")
    assert count == 3
    mock_sb.table.assert_called_with("test")


# ── Jolpica field mapping ────────────────────────────────────────


def test_map_circuit():
    raw = {
        "circuitId": "monza",
        "circuitName": "Autodromo Nazionale di Monza",
        "url": "http://example.com",
        "Location": {
            "lat": "45.6156",
            "long": "9.2811",
            "locality": "Monza",
            "country": "Italy",
        },
    }
    result = _map_circuit(raw)
    assert result["ref"] == "monza"
    assert result["name"] == "Autodromo Nazionale di Monza"
    assert result["lat"] == 45.6156
    assert result["lng"] == 9.2811
    assert result["country"] == "Italy"


def test_map_driver():
    raw = {
        "driverId": "max_verstappen",
        "permanentNumber": "1",
        "code": "VER",
        "givenName": "Max",
        "familyName": "Verstappen",
        "dateOfBirth": "1997-09-30",
        "nationality": "Dutch",
        "url": "http://example.com",
    }
    result = _map_driver(raw)
    assert result["ref"] == "max_verstappen"
    assert result["number"] == 1
    assert result["code"] == "VER"
    assert result["forename"] == "Max"
    assert result["surname"] == "Verstappen"


def test_map_driver_missing_optional_fields():
    raw = {
        "driverId": "old_driver",
        "givenName": "Old",
        "familyName": "Timer",
    }
    result = _map_driver(raw)
    assert result["ref"] == "old_driver"
    assert result["number"] is None
    assert result["code"] is None


def test_map_constructor():
    raw = {
        "constructorId": "red_bull",
        "name": "Red Bull",
        "nationality": "Austrian",
        "url": "http://example.com",
    }
    result = _map_constructor(raw)
    assert result["ref"] == "red_bull"
    assert result["name"] == "Red Bull"


def test_map_result():
    raw = {
        "Driver": {"driverId": "verstappen"},
        "Constructor": {"constructorId": "red_bull"},
        "grid": "1",
        "position": "1",
        "positionText": "1",
        "points": "25",
        "laps": "57",
        "status": "Finished",
        "Time": {"millis": "5674230"},
        "FastestLap": {"rank": "1"},
    }
    result = _map_result(
        raw, race_id=10,
        driver_lookup={"verstappen": 1},
        constructor_lookup={"red_bull": 2},
    )
    assert result["race_id"] == 10
    assert result["driver_id"] == 1
    assert result["constructor_id"] == 2
    assert result["grid"] == 1
    assert result["position"] == 1
    assert result["points"] == 25.0
    assert result["time_millis"] == 5674230
    assert result["fastest_lap_rank"] == 1


def test_map_result_dnf():
    raw = {
        "Driver": {"driverId": "ham"},
        "Constructor": {"constructorId": "merc"},
        "grid": "5",
        "positionText": "Ret",
        "points": "0",
        "laps": "30",
        "status": "Engine",
    }
    result = _map_result(
        raw, race_id=10,
        driver_lookup={"ham": 3},
        constructor_lookup={"merc": 4},
    )
    assert result["position"] is None
    assert result["time_millis"] is None
    assert result["fastest_lap_rank"] is None
    assert result["status"] == "Engine"


def test_map_result_unknown_driver_returns_none():
    raw = {
        "Driver": {"driverId": "unknown"},
        "Constructor": {"constructorId": "merc"},
        "grid": "1",
    }
    result = _map_result(
        raw, race_id=10,
        driver_lookup={},
        constructor_lookup={"merc": 4},
    )
    assert result is None
