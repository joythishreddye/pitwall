"""Bandwidth guard: daily byte budgets and request limits for /api/v1."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi.testclient import TestClient

from app.api.traffic import ApiTrafficGuard, TrafficBudget, protect

DAY = 86_400.0
ORIGIN = "https://pitwall-teal.vercel.app"


def _budget(**overrides: int) -> TrafficBudget:
    limits = {"per_minute": 100, "client_daily_bytes": 1_000, "daily_bytes": 10_000}
    limits.update(overrides)
    return TrafficBudget(**limits)


# ---------------------------------------------------------------------------
# TrafficBudget
# ---------------------------------------------------------------------------


def test_allows_traffic_under_every_limit() -> None:
    budget = _budget()
    assert budget.check("a", now=10) is None
    budget.add("a", 400, now=10)
    assert budget.check("a", now=11) is None


def test_a_client_past_its_daily_share_gets_429_until_midnight() -> None:
    budget = _budget()
    budget.add("a", 1_000, now=DAY + 3_600)

    refusal = budget.check("a", now=DAY + 3_600)

    assert refusal is not None
    assert refusal.status == 429
    assert refusal.retry_after == pytest.approx(DAY - 3_600)
    assert budget.check("b", now=DAY + 3_600) is None  # others are unaffected


def test_the_global_budget_closes_the_api_for_everyone() -> None:
    budget = _budget(client_daily_bytes=10_000, daily_bytes=2_000)
    budget.add("a", 1_500, now=50)
    budget.add("b", 500, now=50)

    refusal = budget.check("c", now=60)

    assert refusal is not None
    assert refusal.status == 503
    assert refusal.retry_after == pytest.approx(DAY - 60)


def test_one_client_is_stopped_long_before_the_global_budget() -> None:
    budget = _budget(client_daily_bytes=1_000, daily_bytes=10_000)
    for _ in range(20):
        if budget.check("flood", now=5) is None:
            budget.add("flood", 300, now=5)

    assert budget.check("flood", now=5).status == 429
    assert budget.check("visitor", now=5) is None


def test_requests_per_minute_are_limited_per_client() -> None:
    budget = _budget(per_minute=2)
    assert budget.check("a", now=0) is None
    assert budget.check("a", now=1) is None

    refusal = budget.check("a", now=2)

    assert refusal is not None
    assert refusal.status == 429
    assert refusal.retry_after == pytest.approx(58)


def test_a_new_utc_day_resets_the_budgets() -> None:
    budget = _budget()
    budget.add("a", 1_000, now=DAY - 10)
    budget.add("b", 9_000, now=DAY - 10)
    assert budget.check("a", now=DAY - 5) is not None

    assert budget.check("a", now=DAY + 5) is None


# ---------------------------------------------------------------------------
# Middleware, wired the way main.py wires it
# ---------------------------------------------------------------------------


def _app(budget: TrafficBudget) -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/big")
    async def big() -> PlainTextResponse:
        return PlainTextResponse("x" * 600)

    @app.get("/api/v1/stream")
    async def stream() -> StreamingResponse:
        async def chunks():
            for i in range(3):
                yield f"data: {i}\n\n"

        return StreamingResponse(chunks(), media_type="text/event-stream")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    protect(app, budget=budget, cors_origins=[ORIGIN])
    return app


def test_refusals_keep_the_cors_header() -> None:
    budget = _budget()
    client = TestClient(_app(budget))
    headers = {"Origin": ORIGIN}

    assert client.get("/api/v1/big", headers=headers).status_code == 200
    budget.add("testclient", 1_000)  # this client's share is now used up
    limited = client.get("/api/v1/big", headers=headers)

    assert limited.status_code == 429
    assert limited.headers["access-control-allow-origin"] == ORIGIN
    assert int(limited.headers["retry-after"]) > 0

    budget.add("someone-else", 10_000)
    closed = client.get("/api/v1/big", headers=headers)
    assert closed.status_code == 503
    assert closed.headers["access-control-allow-origin"] == ORIGIN


def test_response_bytes_are_counted() -> None:
    budget = _budget()
    client = TestClient(_app(budget))

    client.get("/api/v1/big")

    # The 600-byte body plus the status line and headers
    assert 600 < budget.client_bytes("testclient") < 1_000
    assert budget.total_bytes() == budget.client_bytes("testclient")


def test_health_and_preflights_are_never_limited() -> None:
    budget = _budget(daily_bytes=1)
    budget.add("anyone", 10)
    client = TestClient(_app(budget))

    assert client.get("/health").status_code == 200
    preflight = client.options(
        "/api/v1/big",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert preflight.status_code == 200


def test_streams_pass_through_chunk_by_chunk_and_are_counted() -> None:
    budget = _budget()
    sent: list[dict] = []

    async def inner(scope, receive, send) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        for i in range(3):
            await send(
                {
                    "type": "http.response.body",
                    "body": f"data: {i}\n\n".encode(),
                    "more_body": True,
                }
            )
        await send({"type": "http.response.body", "body": b"", "more_body": False})

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        sent.append(message)

    guard = ApiTrafficGuard(inner, budget=budget)
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/chat",
        "headers": [(b"cf-connecting-ip", b"203.0.113.9")],
        "client": ("10.0.0.1", 1234),
    }
    asyncio.run(guard(scope, receive, send))

    bodies = [m for m in sent if m["type"] == "http.response.body"]
    assert len(bodies) == 4  # not buffered into one message
    # A status line with no headers (17 bytes), then three chunks
    assert budget.client_bytes("203.0.113.9") == 17 + 3 * len(b"data: 0\n\n")


def _run_guard(guard: ApiTrafficGuard, method: str, path: str) -> list[dict]:
    sent: list[dict] = []

    async def receive() -> dict:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict) -> None:
        sent.append(message)

    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": [],
        "client": ("198.51.100.7", 1234),
    }
    asyncio.run(guard(scope, receive, send))
    return sent


def test_every_path_but_health_is_metered() -> None:
    budget = _budget()
    client = TestClient(_app(budget))

    client.get("/openapi.json")
    after_docs = budget.total_bytes()
    client.get("/health")

    assert after_docs > 0  # API docs count too
    assert budget.total_bytes() == after_docs  # health checks don't


def test_the_guard_itself_lets_preflights_through() -> None:
    reached: list[str] = []

    async def inner(scope, receive, send) -> None:
        reached.append(scope["method"])
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    budget = _budget(daily_bytes=1)
    budget.add("anyone", 10)  # the API is closed for the day
    guard = ApiTrafficGuard(inner, budget=budget)

    _run_guard(guard, "OPTIONS", "/api/v1/big")
    refused = _run_guard(guard, "GET", "/api/v1/big")

    assert reached == ["OPTIONS"]
    assert refused[0]["status"] == 503


def test_overflow_clients_share_no_per_client_cap(monkeypatch) -> None:
    monkeypatch.setattr("app.api.traffic._MAX_TRACKED_CLIENTS", 1)
    budget = _budget(client_daily_bytes=1_000, daily_bytes=100_000)
    budget.add("first", 10)  # fills the table
    budget.add("second", 5_000)  # lands in the shared overflow bucket

    assert budget.check("third") is None  # not locked out with "second"
    assert budget.total_bytes() == 5_010  # still counted globally


def test_requests_per_minute_are_limited_globally_too() -> None:
    budget = _budget(global_per_minute=3)
    for client in ("a", "b", "c"):
        assert budget.check(client, now=0) is None

    refusal = budget.check("d", now=1)

    assert refusal is not None
    assert refusal.status == 429


def test_closing_the_api_is_logged_once(caplog) -> None:
    budget = _budget(daily_bytes=100)
    budget.add("a", 100, now=10)

    with caplog.at_level("WARNING", logger="app.api.traffic"):
        budget.check("a", now=11)
        budget.check("b", now=12)

    closures = [r for r in caplog.records if "bandwidth budget used" in r.message]
    assert len(closures) == 1


def test_refusals_are_counted_for_alerts() -> None:
    budget = _budget()
    client = TestClient(_app(budget))
    budget.add("testclient", 1_000)  # this client is over its share

    client.get("/api/v1/big")
    client.get("/api/v1/big")

    today = budget.stats()["today"]
    assert today["refused_requests"] == 2
    assert today["refused_kb"] > 0


def test_stats_keep_yesterday_for_the_twice_daily_check() -> None:
    budget = _budget(daily_bytes=1_000)
    budget.add("a", 1_000, now=DAY - 100)
    budget.count_refusal(300, now=DAY - 50)

    stats = budget.stats(now=DAY + 5)

    assert stats["today"]["served_mb"] == 0
    assert stats["yesterday"]["budget_closed"] is True
    assert stats["yesterday"]["refused_requests"] == 1


def test_health_checks_and_preflights_are_counted_but_never_refused() -> None:
    budget = _budget(daily_bytes=1)
    budget.add("anyone", 10)  # the API is closed for the day
    client = TestClient(_app(budget))

    assert client.get("/health").status_code == 200
    client.options(
        "/api/v1/big",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET"},
    )

    assert (
        budget.stats()["today"]["unmetered_requests"] == 1
    )  # CORS answers preflights itself
