"""Shared utilities for data ingestion pipelines."""

import logging
import math
import time
from collections import deque

import httpx
import pandas as pd
from supabase import Client

logger = logging.getLogger(__name__)

BATCH_SIZE = 500


class RateLimiter:
    """Sliding-window rate limiter for API requests."""

    def __init__(self, max_requests: int = 190, window_seconds: int = 3600) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._timestamps: deque[float] = deque()

    def wait_if_needed(self) -> None:
        """Block until a request slot is available."""
        now = time.time()
        cutoff = now - self.window_seconds
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()
        if len(self._timestamps) >= self.max_requests:
            sleep_for = self._timestamps[0] - cutoff + 0.1
            logger.info("Rate limit reached, sleeping %.1fs", sleep_for)
            time.sleep(sleep_for)
            # Re-evaluate after waking
            now = time.time()
            cutoff = now - self.window_seconds
            while self._timestamps and self._timestamps[0] < cutoff:
                self._timestamps.popleft()
        self._timestamps.append(time.time())


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
    supabase: Client, table: str, key_col: str, value_col: str = "id",
) -> dict:
    """Load a {key: value} mapping from a Supabase table."""
    rows = (
        supabase.table(table)
        .select(f"{value_col}, {key_col}")
        .limit(10000)
        .execute()
        .data
    )
    if len(rows) == 10000:
        logger.warning("Lookup for %s hit 10K limit — may be truncated", table)
    return {r[key_col]: r[value_col] for r in rows}


def build_race_lookup(supabase: Client) -> dict[tuple[int, int], int]:
    """Load {(season, round): id} mapping from races table."""
    rows = (
        supabase.table("races")
        .select("id, season, round")
        .limit(10000)
        .execute()
        .data
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
