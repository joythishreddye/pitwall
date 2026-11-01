"""Bandwidth guard for the public API.

Render's Hobby workspace includes 5 GB of outbound bandwidth a month and
bills $0.15/GB after that, with no setting to cap it. This middleware is the
cap. It counts the uncompressed bytes of every API response, which is an
upper bound on what leaves Render after gzip, against two daily budgets:

* per client: a source past its share gets 429s, so one script can't use up
  the day for everyone;
* global: once it's spent, every API route answers 503 until midnight UTC.

Clients are also limited to a number of requests a minute. Counters live in
process memory: PitWall runs one instance, and a deploy or restart resets
them. The default 150 MB a day keeps a month under 4.5 GB.
"""

from __future__ import annotations

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

_DAY_SECONDS = 86_400
# Beyond this many clients in a day, new ones share one counter (memory bound)
_MAX_TRACKED_CLIENTS = 100_000
_OVERFLOW_CLIENT = "~overflow"
# Request-rate cap across all clients. The byte budget already protects the
# bill, so this is set high and only blunts floods.
_GLOBAL_REQUESTS_PER_MINUTE = 6_000


@dataclass(frozen=True)
class Refusal:
    status: int
    retry_after: float
    detail: str


class TrafficBudget:
    """Daily byte budgets (per client and global) plus a per-minute limit."""

    def __init__(
        self,
        *,
        per_minute: int,
        client_daily_bytes: int,
        daily_bytes: int,
    ) -> None:
        self._per_minute = per_minute
        self._client_daily = client_daily_bytes
        self._daily = daily_bytes
        self._limiter = SlidingWindowLimiter(
            per_key=per_minute, global_limit=_GLOBAL_REQUESTS_PER_MINUTE
        )
        self._day = -1
        self._total = 0
        self._clients: dict[str, int] = {}
        self._lock = threading.Lock()

    def check(self, client: str, now: float | None = None) -> Refusal | None:
        """Decide whether ``client`` may make a request right now.

        Returns None (and counts the request toward the per-minute limit)
        when it's allowed; otherwise why not and when to retry.
        """
        t = time.time() if now is None else now
        until_midnight = _DAY_SECONDS - (t % _DAY_SECONDS)
        with self._lock:
            self._roll(t)
            if self._total >= self._daily:
                return Refusal(
                    503,
                    until_midnight,
                    "PitWall has used today's data budget. It resets at midnight UTC.",
                )
            if self._clients.get(self._key(client), 0) >= self._client_daily:
                return Refusal(
                    429,
                    until_midnight,
                    "You've reached today's data limit. It resets at midnight UTC.",
                )
        wait = self._limiter.check(client, now=time.monotonic() if now is None else t)
        if wait is not None:
            return Refusal(429, wait, "Too many requests. Please slow down.")
        return None

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
        """Forget all counts (tests)."""
        with self._lock:
            self._day = -1
            self._total = 0
            self._clients.clear()
        self._limiter = SlidingWindowLimiter(
            per_key=self._per_minute,
            global_limit=_GLOBAL_REQUESTS_PER_MINUTE,
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
            self._day = day
            self._total = 0
            self._clients.clear()

    def _key(self, client: str) -> str:
        if client in self._clients or len(self._clients) < _MAX_TRACKED_CLIENTS:
            return client
        return _OVERFLOW_CLIENT


class ApiTrafficGuard:
    """ASGI middleware that applies a TrafficBudget to one URL prefix.

    Pure ASGI rather than BaseHTTPMiddleware, so streamed responses (chat's
    server-sent events) pass through chunk by chunk.
    """

    def __init__(self, app: ASGIApp, *, budget: TrafficBudget, prefix: str) -> None:
        self.app = app
        self.budget = budget
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] == "OPTIONS"
            or not scope["path"].startswith(self.prefix)
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
            await response(scope, receive, send)
            return

        async def counting_send(message: Message) -> None:
            if message["type"] == "http.response.body":
                self.budget.add(client, len(message.get("body", b"")))
            await send(message)

        await self.app(scope, receive, counting_send)


def protect(
    app: FastAPI,
    *,
    budget: TrafficBudget,
    cors_origins: list[str],
    prefix: str,
) -> None:
    """Install the traffic guard inside CORS.

    Starlette wraps the most recently added middleware outermost, so CORS
    goes last: 429 and 503 answers then carry Access-Control-Allow-Origin,
    and browsers can read them instead of reporting a CORS error.
    """
    app.add_middleware(ApiTrafficGuard, budget=budget, prefix=prefix)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
