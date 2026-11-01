"""In-process sliding-window rate limits for expensive endpoints.

PitWall runs a single API instance, so per-process counters are enough. The
global window protects the shared LLM and embedding quotas even if a client
rotates addresses.
"""

from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import Request

_MAX_TRACKED_CLIENTS = 10_000


class SlidingWindowLimiter:
    """Allow at most ``per_key`` hits per client and ``global_limit`` overall
    within any ``window_seconds`` span."""

    def __init__(
        self,
        per_key: int,
        global_limit: int,
        window_seconds: float = 60.0,
    ) -> None:
        self._per_key = per_key
        self._global_limit = global_limit
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._all: deque[float] = deque()
        self._lock = threading.Lock()

    def check(self, key: str, now: float | None = None) -> float | None:
        """Record a hit for ``key`` if it's allowed.

        Args:
            key: The client identity, usually an IP address.
            now: Monotonic timestamp override, for tests.

        Returns:
            None when the hit is allowed (and recorded). Otherwise the number
            of seconds until the client may try again; nothing is recorded.
        """
        t = time.monotonic() if now is None else now
        cutoff = t - self._window
        with self._lock:
            while self._all and self._all[0] <= cutoff:
                self._all.popleft()
            hits = self._hits.get(key)
            if hits is not None:
                while hits and hits[0] <= cutoff:
                    hits.popleft()

            if hits is not None and len(hits) >= self._per_key:
                return max(hits[0] + self._window - t, 0.0)
            if len(self._all) >= self._global_limit:
                return max(self._all[0] + self._window - t, 0.0)

            if hits is None:
                if len(self._hits) >= _MAX_TRACKED_CLIENTS:
                    self._prune(cutoff)
                hits = self._hits.setdefault(key, deque())
            hits.append(t)
            self._all.append(t)
            return None

    def _prune(self, cutoff: float) -> None:
        """Forget clients with no hits inside the current window."""
        stale = [k for k, h in self._hits.items() if not h or h[-1] <= cutoff]
        for k in stale:
            del self._hits[k]


def client_ip(request: Request) -> str:
    """Best-effort client address behind Render's proxy.

    Render's proxy appends the address it saw to X-Forwarded-For, so the
    rightmost entry is the one a client can't forge.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if parts:
        return parts[-1]
    return request.client.host if request.client else "unknown"
