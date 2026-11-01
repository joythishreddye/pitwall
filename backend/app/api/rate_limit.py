"""In-process sliding-window rate limits for expensive endpoints.

PitWall runs a single API instance, so per-process counters are enough. The
global window protects the shared LLM and embedding quotas even if a client
rotates addresses.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque

from fastapi import Request

logger = logging.getLogger(__name__)

_MAX_TRACKED_CLIENTS = 10_000
_logged_source = False


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
    """Best-effort client address behind Render's edge.

    Render serves its domains through Cloudflare, which sets CF-Connecting-IP
    to the address it saw and overwrites any value a client sends. Without
    it, use the rightmost X-Forwarded-For entry (the hop a client can't
    forge), then the socket peer.
    """
    cf_ip = request.headers.get("cf-connecting-ip", "").strip()
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if cf_ip:
        source, ip = "cf-connecting-ip", cf_ip
    elif parts:
        source, ip = "x-forwarded-for", parts[-1]
    else:
        source = "socket"
        ip = request.client.host if request.client else "unknown"
    _log_source_once(source, len(parts))
    return ip


def _log_source_once(source: str, forwarded_hops: int) -> None:
    """Record which header keys the rate limits (no addresses are logged)."""
    global _logged_source
    if not _logged_source:
        _logged_source = True
        logger.info(
            "Rate limits keyed on %s (X-Forwarded-For hops: %d)", source, forwarded_hops
        )
