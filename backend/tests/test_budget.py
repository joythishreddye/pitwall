"""ApiBudget: the Postgres-backed monthly ceiling fails closed."""

import re
from unittest.mock import MagicMock

from app.rag.budget import ApiBudget, current_period


def _db(data=None, exc: Exception | None = None) -> MagicMock:
    db = MagicMock()
    execute = db.rpc.return_value.execute
    if exc is not None:
        execute.side_effect = exc
    else:
        execute.return_value = MagicMock(data=data)
    return db


def test_allows_calls_under_the_ceiling() -> None:
    db = _db(data=True)
    budget = ApiBudget(db, monthly_limit=100)

    assert budget.consume() is True
    db.rpc.assert_called_once_with(
        "consume_api_budget",
        {"p_provider": "huggingface", "p_limit": 100, "p_units": 1},
    )


def test_blocks_calls_over_the_ceiling() -> None:
    assert ApiBudget(_db(data=False), monthly_limit=100).consume() is False


def test_accepts_list_shaped_rpc_results() -> None:
    assert ApiBudget(_db(data=[True]), monthly_limit=100).consume() is True


def test_fails_closed_when_the_counter_is_unreachable() -> None:
    budget = ApiBudget(_db(exc=RuntimeError("db down")), monthly_limit=100)
    assert budget.consume() is False


def test_zero_limit_disables_calls_without_touching_the_db() -> None:
    db = _db(data=True)
    assert ApiBudget(db, monthly_limit=0).consume() is False
    db.rpc.assert_not_called()


def test_reads_this_months_usage() -> None:
    db = MagicMock()
    query = db.table.return_value.select.return_value.eq.return_value.eq.return_value
    query.limit.return_value.execute.return_value = MagicMock(data=[{"calls": 42}])

    assert ApiBudget(db, monthly_limit=100).used_this_month() == 42


def test_usage_is_none_when_unreadable() -> None:
    db = MagicMock()
    db.table.side_effect = RuntimeError("db down")
    assert ApiBudget(db, monthly_limit=100).used_this_month() is None


def test_period_is_a_utc_month() -> None:
    assert re.fullmatch(r"\d{4}-\d{2}", current_period())
