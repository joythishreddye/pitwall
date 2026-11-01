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

    protect(app, budget=budget, cors_origins=[ORIGIN], prefix="/api/v1")
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

    assert budget.client_bytes("testclient") == 600
    assert budget.total_bytes() == 600


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

    guard = ApiTrafficGuard(inner, budget=budget, prefix="/api/v1")
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
    assert budget.client_bytes("203.0.113.9") == 3 * len(b"data: 0\n\n")
