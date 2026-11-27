"""Shared utilities for data ingestion pipelines."""

import logging
import math
import time
from collections import deque

import httpx
import pandas as pd
from supabase import Client

from app.db.supabase import fetch_all

logger = logging.getLogger(__name__)

BATCH_SIZE = 500


class RateLimiter:
    """Sliding-window rate limiter for API requests.

    Holds two windows at once: at most ``max_requests`` in any ``window_seconds``,
    and, unless ``burst`` is None, at most ``burst`` in any one second. The defaults
    stay inside Jolpica's unauthenticated limits, 500 an hour and 4 a second
    (jolpica-f1's docs/rate_limits.md). A burst past 4 a second draws a 429, and
    fetch_json then backs off for 60 s.
    """

    def __init__(
        self, max_requests: int = 190, window_seconds: int = 3600, burst: int | None = 3
    ) -> None:
        if max_requests < 1 or (burst is not None and burst < 1):
            raise ValueError("max_requests and burst must be at least 1")
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._windows: list[tuple[int, float]] = [(max_requests, float(window_seconds))]
        if burst is not None:
            self._windows.append((burst, 1.0))
        self._longest = max(window for _, window in self._windows)
        self._timestamps: deque[float] = deque()

    def _wait_seconds(self, now: float) -> float:
        """How long until a request fits every window (0 if it fits now)."""
        while self._timestamps and self._timestamps[0] <= now - self._longest:
            self._timestamps.popleft()
        wait = 0.0
        for limit, window in self._windows:
            recent = [t for t in self._timestamps if t > now - window]
            if len(recent) >= limit:
                # A hundredth of a second past the edge, so float rounding can't
                # leave a zero-length wait.
                wait = max(wait, recent[-limit] + window - now + 0.01)
        return wait

    def wait_if_needed(self) -> None:
        """Block until a request slot is available, then claim it."""
        while (wait := self._wait_seconds(time.monotonic())) > 0:
            if wait >= 1:
                logger.info("Rate limit reached, sleeping %.1fs", wait)
            time.sleep(wait)
        self._timestamps.append(time.monotonic())


def fetch_json(
    client: httpx.Client,
    url: str,
    rate_limiter: RateLimiter,
    *,
    params: dict | None = None,
) -> dict:
    """GET JSON from Jolpica with rate limiting and retry."""
    for attempt in range(4):
        rate_limiter.wait_if_needed()
        try:
            resp = client.get(url, params=params)
            if resp.status_code == 429:
                wait = min(60 * (2**attempt), 600)
                logger.warning("429 rate limited, backing off %ds", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()["MRData"]
        except (httpx.HTTPError, KeyError) as exc:
            if attempt == 3:
                raise
            wait = 2 ** (attempt + 1)
            logger.warning("Request failed (%s), retry in %ds", exc, wait)
            time.sleep(wait)
    raise RuntimeError(f"Failed after retries: {url}")


def build_lookup(
    supabase: Client,
    table: str,
    key_col: str,
    value_col: str = "id",
) -> dict:
    """Load a {key: value} mapping from every row of a Supabase table.

    Paged with fetch_all: the database answers at most 1,000 rows a request,
    so one read would cut the lookup short without a word. ``value_col`` must
    be unique (the default, ``id``, is), since the pages are ordered on it.
    """
    rows = fetch_all(
        lambda: supabase.table(table).select(f"{value_col}, {key_col}").order(value_col)
    )
    return {r[key_col]: r[value_col] for r in rows}


def build_race_lookup(supabase: Client) -> dict[tuple[int, int], int]:
    """Load {(season, round): id} mapping from every row of the races table."""
    rows = fetch_all(
        lambda: supabase.table("races").select("id, season, round").order("id")
    )
    return {(r["season"], r["round"]): r["id"] for r in rows}


def batch_upsert(
    supabase: Client,
    table: str,
    rows: list[dict],
    on_conflict: str,
) -> int:
    """Upsert rows in batches, returning total count."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        supabase.table(table).upsert(chunk, on_conflict=on_conflict).execute()
        total += len(chunk)
    return total


def td_to_ms(td) -> int | None:
    """Convert a pandas Timedelta to integer milliseconds, or None if NaT."""
    if pd.isna(td):
        return None
    return int(td.total_seconds() * 1000)


def safe_int(val, default: int | None = None) -> int | None:
    """Safely convert a value to int, returning default on failure."""
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def safe_float(val, default: float | None = None) -> float | None:
    """Safely convert a value to float, returning default on failure."""
    if val is None:
        return default
    try:
        result = float(val)
        return default if math.isnan(result) else result
    except (ValueError, TypeError):
        return default
