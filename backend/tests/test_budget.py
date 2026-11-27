"""ApiBudget: the Postgres-backed monthly ceiling fails closed."""

import re
from datetime import UTC, datetime
from unittest.mock import MagicMock

import app.rag.budget as budget_module
from app.rag.budget import (
    ApiBudget,
    DailyBudget,
    current_day,
    current_period,
    seconds_to_next_day,
)


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


def test_a_daily_budget_counts_on_a_key_with_the_day(monkeypatch) -> None:
    # A fixed day, so a run across midnight UTC can't flake
    monkeypatch.setattr(budget_module, "current_day", lambda: "2026-11-29")
    db = _db(data=True)
    assert DailyBudget(db, daily_limit=40, name="groq-chat").consume() is True
    assert db.rpc.call_args.args[1]["p_provider"] == "groq-chat:2026-11-29"
    assert db.rpc.call_args.args[1]["p_limit"] == 40


def test_the_day_is_utc() -> None:
    # Read around it: the clock may pass midnight UTC in between
    before = datetime.now(UTC).date().isoformat()
    day = current_day()
    after = datetime.now(UTC).date().isoformat()
    assert day in {before, after}


def test_a_daily_budget_refuses_once_spent() -> None:
    assert DailyBudget(_db(data=[False]), daily_limit=40, name="x").consume() is False


def test_a_daily_budget_of_zero_refuses_without_asking() -> None:
    db = _db(data=True)
    assert DailyBudget(db, daily_limit=0, name="x").consume() is False
    db.rpc.assert_not_called()


def test_a_daily_budget_lets_the_question_through_when_the_counter_is_down() -> None:
    # Groq's free tier can't bill: a lost count only risks Groq's own refusal
    budget = DailyBudget(_db(exc=RuntimeError("db down")), daily_limit=40, name="x")
    assert budget.consume() is True


def test_the_day_ends_at_midnight_utc() -> None:
    noon = datetime(2026, 11, 27, 12, tzinfo=UTC)
    assert seconds_to_next_day(noon) == 12 * 3600
