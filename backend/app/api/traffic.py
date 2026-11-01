"""Bandwidth guard for the API.

Render's Hobby workspace includes 5 GB of outbound bandwidth a month and
bills $0.15/GB after that, with no setting to cap it. This middleware meters
what the API serves: the headers and uncompressed body of every response
(an upper bound on what leaves Render after gzip) count against two daily
budgets:

* per client: a source past its share gets 429s, so one script can't use up
  the day for everyone;
* global: once it's spent, everything except /health answers 503 until
  midnight UTC.

Clients are also limited to a number of requests a minute.

What it can't cap: the refusals themselves (about 0.3 KB each) and CORS
preflights. They still cost bandwidth: one source sending 100 refused
requests a second would add about 3.5 GB a day. Only a rate limit at the
network edge could stop that, so refusals are counted instead. /health/ready
reports today's and yesterday's traffic, and the keep-alive workflow fails
(GitHub emails the owner) when refusals spike or the budget closes. That
warning comes days before the 5 GB allowance could run out.

Counters live in process memory: PitWall runs one instance, and a deploy or
restart resets them. The default 150 MB a day keeps a month under 4.5 GB.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.rate_limit import SlidingWindowLimiter, client_ip

logger = logging.getLogger(__name__)

_DAY_SECONDS = 86_400
# Beyond this many clients in a day, new ones share one counter (memory
# bound). That shared counter is exempt from the per-client cap, so ordinary
# visitors aren't locked out together; the global budget still applies.
_MAX_TRACKED_CLIENTS = 100_000
_OVERFLOW_CLIENT = "~overflow"
# Request-rate cap across all clients. The byte budget already protects the
# bill, so this is set high and only blunts floods.
_GLOBAL_REQUESTS_PER_MINUTE = 6_000
# Log at most this many clients reaching their daily cap per day
_CAP_LOGS_PER_DAY = 10


@dataclass(frozen=True)
class Refusal:
    status: int
    retry_after: float
    detail: str


class TrafficBudget:
    """Daily byte budgets (per client and global) plus per-minute limits."""

    def __init__(
        self,
        *,
        per_minute: int,
        client_daily_bytes: int,
        daily_bytes: int,
        global_per_minute: int = _GLOBAL_REQUESTS_PER_MINUTE,
    ) -> None:
        self._per_minute = per_minute
        self._global_per_minute = global_per_minute
        self._client_daily = client_daily_bytes
        self._daily = daily_bytes
        self._lock = threading.Lock()
        self.reset()

    def check(self, client: str, now: float | None = None) -> Refusal | None:
        """Decide whether ``client`` may make a request right now.

        Returns None (and counts the request toward the per-minute limits)
        when it's allowed; otherwise why not and when to retry.
        """
        t = time.time() if now is None else now
        until_midnight = _DAY_SECONDS - (t % _DAY_SECONDS)
        with self._lock:
            self._roll(t)
            if self._total >= self._daily:
                if not self._closed_logged:
                    self._closed_logged = True
                    logger.warning(
                        "Daily API bandwidth budget used (%d bytes); serving 503 "
                        "until midnight UTC",
                        self._total,
                    )
                return Refusal(
                    503,
                    until_midnight,
                    "PitWall has used today's data budget. It resets at midnight UTC.",
                )
            key = self._key(client)
            if (
                key != _OVERFLOW_CLIENT
                and self._clients.get(key, 0) >= self._client_daily
            ):
                if key not in self._capped and len(self._capped) < _CAP_LOGS_PER_DAY:
                    self._capped.add(key)
                    logger.warning("A client reached its daily API data limit")
                return Refusal(
                    429,
                    until_midnight,
                    "You've reached today's data limit. It resets at midnight UTC.",
                )
        wait = self._limiter.check(client, now=time.monotonic() if now is None else t)
        if wait is not None:
            return Refusal(429, wait, "Too many requests. Please slow down.")
        return None

    def count_refusal(self, n: int, now: float | None = None) -> None:
        """Record one refused request and the bytes its answer took."""
        t = time.time() if now is None else now
        with self._lock:
            self._roll(t)
            self._refused += 1
            self._refused_bytes += max(n, 0)

    def stats(self, now: float | None = None) -> dict:
        """Today's traffic and yesterday's (served in MB, refusals in KB)."""
        t = time.time() if now is None else now
        with self._lock:
            self._roll(t)
            return {"today": self._snapshot(), "yesterday": self._yesterday}

    def _snapshot(self) -> dict:
        return {
            "served_mb": round(self._total / 1_000_000, 2),
            "budget_mb": round(self._daily / 1_000_000, 2),
            "refused_requests": self._refused,
            "refused_kb": round(self._refused_bytes / 1_000, 1),
            "budget_closed": self._total >= self._daily,
        }

    def add(self, client: str, n: int, now: float | None = None) -> None:
        """Count ``n`` response bytes sent to ``client``."""
        if n <= 0:
            return
        t = time.time() if now is None else now
        with self._lock:
            self._roll(t)
            key = self._key(client)
            self._clients[key] = self._clients.get(key, 0) + n
            self._total += n

    def reset(self) -> None:
        """Forget all counts (startup and tests)."""
        with self._lock:
            self._day = -1
            self._total = 0
            self._clients: dict[str, int] = {}
            self._capped: set[str] = set()
            self._closed_logged = False
            self._refused = 0
            self._refused_bytes = 0
            self._yesterday: dict | None = None
        self._limiter = SlidingWindowLimiter(
            per_key=self._per_minute, global_limit=self._global_per_minute
        )

    def client_bytes(self, client: str) -> int:
        with self._lock:
            return self._clients.get(self._key(client), 0)

    def total_bytes(self) -> int:
        with self._lock:
            return self._total

    def _roll(self, t: float) -> None:
        day = int(t // _DAY_SECONDS)
        if day != self._day:
            # Keep the day that just ended, so a twice-daily check sees it
            self._yesterday = self._snapshot() if day == self._day + 1 else None
            self._day = day
            self._total = 0
            self._clients.clear()
            self._capped.clear()
            self._closed_logged = False
            self._refused = 0
            self._refused_bytes = 0

    def _key(self, client: str) -> str:
        if client in self._clients or len(self._clients) < _MAX_TRACKED_CLIENTS:
            return client
        return _OVERFLOW_CLIENT


def _header_bytes(message: Message) -> int:
    """Approximate wire size of a response's status line and headers."""
    headers = message.get("headers") or []
    return 17 + sum(len(name) + len(value) + 4 for name, value in headers)


class ApiTrafficGuard:
    """ASGI middleware that applies a TrafficBudget to every HTTP request
    except the exempt paths (health checks).

    Pure ASGI rather than BaseHTTPMiddleware, so streamed responses (chat's
    server-sent events) pass through chunk by chunk.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        budget: TrafficBudget,
        exempt: tuple[str, ...] = ("/health",),
    ) -> None:
        self.app = app
        self.budget = budget
        self.exempt = exempt

    def _is_exempt(self, path: str) -> bool:
        return any(path == p or path.startswith(p + "/") for p in self.exempt)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] == "OPTIONS"
            or self._is_exempt(scope["path"])
        ):
            await self.app(scope, receive, send)
            return

        client = client_ip(Request(scope))
        refusal = self.budget.check(client)
        if refusal is not None:
            response = JSONResponse(
                {"detail": refusal.detail},
                status_code=refusal.status,
                headers={"Retry-After": str(max(1, math.ceil(refusal.retry_after)))},
            )
            refusal_bytes = 0

            async def refusal_send(message: Message) -> None:
                nonlocal refusal_bytes
                if message["type"] == "http.response.start":
                    refusal_bytes += _header_bytes(message)
                elif message["type"] == "http.response.body":
                    refusal_bytes += len(message.get("body", b""))
                await send(message)

            await response(scope, receive, refusal_send)
            self.budget.count_refusal(refusal_bytes)
            return

        async def counting_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                self.budget.add(client, _header_bytes(message))
            elif message["type"] == "http.response.body":
                self.budget.add(client, len(message.get("body", b"")))
            await send(message)

        await self.app(scope, receive, counting_send)


def protect(
    app: FastAPI,
    *,
    budget: TrafficBudget,
    cors_origins: list[str],
    exempt: tuple[str, ...] = ("/health",),
) -> None:
    """Install the traffic guard inside CORS.

    Starlette wraps the most recently added middleware outermost, so CORS
    goes last: 429 and 503 answers then carry Access-Control-Allow-Origin,
    and browsers can read them instead of reporting a CORS error.
    """
    app.add_middleware(ApiTrafficGuard, budget=budget, exempt=exempt)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
