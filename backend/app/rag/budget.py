"""Monthly ceilings on billable third-party API calls.

The counter lives in Postgres (the ``consume_api_budget`` function) rather than
in process memory, so the ceiling survives deploys and restarts. Checks fail
closed: if the counter can't be reached, the call is treated as over budget.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from supabase import Client

logger = logging.getLogger(__name__)


def current_period() -> str:
    """The UTC month the counter is keyed on, e.g. ``2026-11``."""
    return datetime.now(UTC).strftime("%Y-%m")


def current_day() -> str:
    """The UTC day a daily budget is keyed on, e.g. ``2026-11-27``."""
    return datetime.now(UTC).strftime("%Y-%m-%d")


def seconds_to_next_day(now: datetime | None = None) -> int:
    """Seconds until the next UTC midnight, when a daily budget starts over."""
    now = (now or datetime.now(UTC)).astimezone(UTC)
    midnight = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return max(1, int((midnight - now).total_seconds()))


class ApiBudget:
    """Counts calls to one provider per UTC month against a hard ceiling."""

    def __init__(
        self,
        db: Client,
        monthly_limit: int,
        provider: str = "huggingface",
    ) -> None:
        self._db = db
        self._limit = monthly_limit
        self._provider = provider

    @property
    def monthly_limit(self) -> int:
        return self._limit

    def consume(self, units: int = 1) -> bool:
        """Record ``units`` calls and report whether they fit under the ceiling.

        Args:
            units: How many billable requests the caller is about to make.

        Returns:
            True if the calls may go ahead. False when the ceiling is reached,
            the limit is 0, or the counter can't be reached.
        """
        if self._limit <= 0:
            return False
        try:
            result = self._db.rpc(
                "consume_api_budget",
                {
                    "p_provider": self._provider,
                    "p_limit": self._limit,
                    "p_units": units,
                },
            ).execute()
        except Exception:
            logger.exception(
                "Budget check for %s failed; treating as over budget", self._provider
            )
            return False
        data = result.data
        allowed = (data[0] if isinstance(data, list) and data else data) is True
        if not allowed:
            logger.warning(
                "Monthly %s ceiling of %d calls reached", self._provider, self._limit
            )
        return allowed

    def used_this_month(self) -> int | None:
        """Calls recorded this UTC month, or None if the counter can't be read."""
        try:
            result = (
                self._db.table("api_usage")
                .select("calls")
                .eq("provider", self._provider)
                .eq("period", current_period())
                .limit(1)
                .execute()
            )
        except Exception:
            logger.exception("Could not read %s usage", self._provider)
            return None
        return int(result.data[0]["calls"]) if result.data else 0


class DailyBudget:
    """Counts uses per UTC day against a ceiling, on the same Postgres counter:
    the day goes into the provider key, so no new table is needed.

    It fails open, unlike ApiBudget: it guards a free tier (Groq's) whose own
    limit refuses past it, so a counter that can't be reached shouldn't turn
    the chat off.
    """

    def __init__(self, db: Client, daily_limit: int, name: str) -> None:
        self._db = db
        self._limit = daily_limit
        self._name = name

    def consume(self) -> bool:
        """Record one use; whether it fits under today's ceiling."""
        if self._limit <= 0:
            return False
        try:
            result = self._db.rpc(
                "consume_api_budget",
                {
                    "p_provider": f"{self._name}:{current_day()}",
                    "p_limit": self._limit,
                    "p_units": 1,
                },
            ).execute()
        except Exception:
            logger.exception(
                "Daily %s count failed; letting the question through", self._name
            )
            return True
        data = result.data
        allowed = (data[0] if isinstance(data, list) and data else data) is True
        if not allowed:
            logger.warning("Daily %s ceiling of %d reached", self._name, self._limit)
        return allowed
