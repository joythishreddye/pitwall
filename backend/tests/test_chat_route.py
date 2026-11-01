"""Chat endpoint: SSE contract, failure events and rate limiting."""

import json
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.rate_limit import SlidingWindowLimiter
from app.api.routes import chat as chat_route
from app.llm.base import LLMError
from app.main import app

_INTENT = '{"intent": "factual", "entities": {}, "metadata_filter": {}}'


def _llm(tokens: list[str] | None = None, error: Exception | None = None) -> MagicMock:
    llm = MagicMock()
    llm.generate = AsyncMock(return_value=_INTENT)

    async def stream(*_args, **_kwargs):
        for token in tokens or []:
            yield token
        if error is not None:
            raise error

    llm.stream_chat = stream
    return llm


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch) -> Iterator[callable]:
    """Override the chat route's dependencies with fakes."""
    monkeypatch.setattr(
        chat_route,
        "_chat_limiter",
        SlidingWindowLimiter(per_key=100, global_limit=100),
    )

    def apply(llm: MagicMock) -> None:
        db = MagicMock()
        db.rpc.return_value.execute.return_value = MagicMock(data=[])
        embedder = MagicMock()
        embedder.embed_query.return_value = [0.1] * 768
        app.dependency_overrides[chat_route.get_db] = lambda: db
        app.dependency_overrides[chat_route.get_llm] = lambda: llm
        app.dependency_overrides[chat_route.get_intent_llm] = lambda: llm
        app.dependency_overrides[chat_route.get_embedder] = lambda: embedder
        app.dependency_overrides[chat_route.get_budget] = lambda: None

    yield apply
    app.dependency_overrides.clear()


async def _ask(message: str = "Who won Monza in 2025?"):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/v1/chat", json={"message": message})


def _events(body: str) -> list[dict]:
    return [
        json.loads(line[len("data: ") :])
        for line in body.splitlines()
        if line.startswith("data: ")
    ]


async def test_streams_sources_tokens_then_done(wire) -> None:
    wire(_llm(tokens=["Box", ", box"]))

    events = _events((await _ask()).text)

    assert events[0]["type"] == "sources"
    assert "retrieval" in events[0]
    assert [e["data"] for e in events if e["type"] == "token"] == ["Box", ", box"]
    assert events[-1] == {"type": "done"}


async def test_llm_failure_ends_with_an_error_event(wire) -> None:
    wire(_llm(tokens=["Partial"], error=LLMError("404", status_code=404)))

    events = _events((await _ask()).text)

    assert events[-1]["type"] == "error"
    assert "didn't answer" in events[-1]["data"]
    assert not any(e["type"] == "done" for e in events)


async def test_rate_limited_llm_gets_a_specific_message(wire) -> None:
    wire(_llm(error=LLMError("429", status_code=429)))

    events = _events((await _ask()).text)

    assert "busy" in events[-1]["data"]


async def test_too_many_questions_get_429(wire, monkeypatch) -> None:
    wire(_llm(tokens=["ok"]))
    monkeypatch.setattr(
        chat_route,
        "_chat_limiter",
        SlidingWindowLimiter(per_key=1, global_limit=100),
    )

    first = await _ask()
    second = await _ask()

    assert first.status_code == 200
    assert second.status_code == 429
    assert int(second.headers["Retry-After"]) >= 1
