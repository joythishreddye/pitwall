"""Startup resilience and the /health/ready endpoint."""

import asyncio
import time
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.llm.base import LLMError
from app.main import _ready_cache, app, lifespan


@pytest.fixture(autouse=True)
def fresh_state() -> Iterator[None]:
    """Give each test healthy dependencies and an empty readiness cache."""
    _ready_cache.clear()
    app.state.llm = MagicMock()
    app.state.llm.health_check = AsyncMock()
    app.state.intent_llm = MagicMock()
    app.state.intent_llm.health_check = AsyncMock()
    app.state.embedder = MagicMock(status="unknown")
    app.state.embedder.embed_query.return_value = [0.1] * 768
    app.state.budget = MagicMock()
    app.state.budget.used_this_month.return_value = 7
    yield
    _ready_cache.clear()


async def _get(path: str, **kwargs):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path, **kwargs)


async def test_ready_when_every_dependency_answers() -> None:
    with patch("app.main.ping_supabase"):
        response = await _get("/health/ready")

    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "ready"
    assert body["checks"] == {
        "database": "ok",
        "llm": "ok",
        "intent_llm": "ok",
        "embeddings": "unknown",
    }
    assert body["intent_model"] == "openai/gpt-oss-20b"
    assert "hf_calls_this_month" not in body  # usage is for deep checks only


async def test_degraded_when_the_database_is_down() -> None:
    with patch("app.main.ping_supabase", side_effect=RuntimeError("paused")):
        response = await _get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["database"] == "error"


async def test_degraded_when_the_model_is_retired() -> None:
    app.state.llm.health_check.side_effect = LLMError("404", status_code=404)
    with patch("app.main.ping_supabase"):
        response = await _get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["llm"] == "error"


async def test_degraded_when_the_intent_model_is_retired() -> None:
    app.state.intent_llm.health_check.side_effect = LLMError("404", status_code=404)
    with patch("app.main.ping_supabase"):
        response = await _get("/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["intent_llm"] == "error"


async def test_shallow_results_are_cached() -> None:
    with patch("app.main.ping_supabase") as ping:
        await _get("/health/ready")
        await _get("/health/ready")

    assert ping.call_count == 1


async def test_deep_check_requires_the_token() -> None:
    with patch("app.main.settings.health_check_token", "s3cret"):
        missing = await _get("/health/ready", params={"deep": "true"})
        wrong = await _get(
            "/health/ready",
            params={"deep": "true"},
            headers={"X-Health-Token": "nope"},
        )

    assert missing.status_code == 403
    assert wrong.status_code == 403


async def test_deep_check_makes_a_real_embedding_call() -> None:
    with (
        patch("app.main.settings.health_check_token", "s3cret"),
        patch("app.main.ping_supabase"),
    ):
        response = await _get(
            "/health/ready",
            params={"deep": "true"},
            headers={"X-Health-Token": "s3cret"},
        )

    assert response.status_code == 200
    assert response.json()["checks"]["embeddings"] == "ok"
    assert response.json()["hf_calls_this_month"] == 7
    app.state.embedder.embed_query.assert_called_once_with(
        "readiness probe", use_cache=False
    )


async def test_concurrent_cold_requests_share_one_probe() -> None:
    calls = 0

    def slow_ping() -> None:
        nonlocal calls
        calls += 1
        time.sleep(0.05)

    with patch("app.main.ping_supabase", side_effect=slow_ping):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            responses = await asyncio.gather(
                *(client.get("/health/ready") for _ in range(10))
            )

    assert {r.status_code for r in responses} == {200}
    assert calls == 1
    assert app.state.llm.health_check.await_count == 1


async def test_startup_survives_dependency_outages() -> None:
    with (
        patch("app.main.get_supabase", return_value=MagicMock()),
        patch("app.main.ping_supabase", side_effect=RuntimeError("paused")),
        patch("app.main.get_redis", return_value=None),
        patch("app.main.create_llm", return_value=MagicMock()),
        patch("app.main.EntityLinker.from_db", side_effect=RuntimeError("no db")),
        patch("app.main.QueryEmbedder") as embedder_cls,
    ):
        async with lifespan(app):
            assert app.state.embedder is embedder_cls.return_value
            assert app.state.redis is None
            assert app.state.linker is None

    embedder_cls.return_value.close.assert_called_once()
