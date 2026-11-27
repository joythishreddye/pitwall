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
    monkeypatch.setattr(
        chat_route,
        "_reader_day_limiter",
        SlidingWindowLimiter(per_key=100, global_limit=100, window_seconds=86400),
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
        app.dependency_overrides[chat_route.get_linker] = lambda: None
        # Never a budget another test's app startup left behind
        app.dependency_overrides[chat_route.get_answer_budget] = lambda: None

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


async def test_an_empty_answer_ends_with_an_error_event(wire) -> None:
    wire(_llm(tokens=[]))

    events = _events((await _ask()).text)

    assert events[-1]["type"] == "error"
    assert "didn't come back" in events[-1]["data"]


async def test_rate_limited_llm_gets_a_specific_message(wire) -> None:
    wire(_llm(error=LLMError("429", status_code=429)))

    events = _events((await _ask()).text)

    assert "busy" in events[-1]["data"]


@pytest.mark.parametrize(
    ("wait", "said"),
    [(121, "about 3 minutes"), (300, "about 5 minutes"), (5 * 3600, "about 5 hours")],
)
async def test_a_long_wait_from_the_model_says_how_long(
    wire, wait: int, said: str
) -> None:
    # Groq asks for minutes or hours, not seconds, once its tokens are spent
    wire(_llm(error=LLMError("429", status_code=429, retry_after=wait)))

    events = _events((await _ask()).text)

    assert "busy" not in events[-1]["data"]
    assert said in events[-1]["data"]


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


def test_linker_is_rebuilt_after_a_failed_boot(monkeypatch) -> None:
    from starlette.requests import Request

    clock = [1000.0]
    monkeypatch.setattr("app.api.routes.chat.time.monotonic", lambda: clock[0])
    built = MagicMock()
    from_db = MagicMock(side_effect=[RuntimeError("db blip"), built])
    monkeypatch.setattr("app.api.routes.chat.EntityLinker.from_db", from_db)
    monkeypatch.setattr("app.api.routes.chat.get_supabase", lambda: MagicMock())

    state = type("State", (), {})()
    request = Request({"type": "http", "app": type("App", (), {"state": state})()})

    assert chat_route.get_linker(request) is None  # first try fails
    assert chat_route.get_linker(request) is None  # cooling down, no retry
    assert from_db.call_count == 1
    clock[0] += 301
    assert chat_route.get_linker(request) is built
    assert chat_route.get_linker(request) is built  # cached after that
    assert from_db.call_count == 2


async def test_a_spent_daily_budget_gets_429_before_any_model_call(wire) -> None:
    llm = _llm(tokens=["never"])
    wire(llm)
    spent = MagicMock()
    spent.consume.return_value = False
    app.dependency_overrides[chat_route.get_answer_budget] = lambda: spent

    response = await _ask()

    assert response.status_code == 429
    assert "today" in response.json()["detail"]
    assert 0 < int(response.headers["Retry-After"]) <= 86400
    llm.generate.assert_not_called()


async def test_a_question_the_rate_limit_refuses_spends_none_of_the_day(
    wire, monkeypatch
) -> None:
    wire(_llm(tokens=["Box"]))
    monkeypatch.setattr(
        chat_route, "_chat_limiter", SlidingWindowLimiter(per_key=1, global_limit=1)
    )
    budget = MagicMock()
    budget.consume.return_value = True
    app.dependency_overrides[chat_route.get_answer_budget] = lambda: budget

    await _ask()
    second = await _ask()

    assert second.status_code == 429
    assert budget.consume.call_count == 1


@pytest.mark.parametrize(
    "body",
    [
        {"message": "x" * 2001},
        {},
        {
            "message": "Who won?",
            "history": [{"role": "assistant", "content": "x" * 4001}],
        },
    ],
)
async def test_a_question_that_fails_its_checks_spends_none_of_the_day(
    wire, body: dict
) -> None:
    wire(_llm(tokens=["Box"]))
    budget = MagicMock()
    budget.consume.return_value = True
    app.dependency_overrides[chat_route.get_answer_budget] = lambda: budget

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/chat", json=body)

    assert response.status_code == 422
    budget.consume.assert_not_called()


@pytest.mark.parametrize("wait", [None, 30, 120])
async def test_a_short_wait_from_the_model_reads_as_busy(wire, wait) -> None:
    wire(_llm(error=LLMError("429", status_code=429, retry_after=wait)))

    events = _events((await _ask()).text)

    assert "busy" in events[-1]["data"]


async def test_a_reader_past_their_share_of_the_day_gets_429_and_spends_none_of_it(
    wire, monkeypatch
) -> None:
    llm = _llm(tokens=["Box"])
    wire(llm)
    monkeypatch.setattr(
        chat_route,
        "_reader_day_limiter",
        SlidingWindowLimiter(per_key=1, global_limit=100, window_seconds=86400),
    )
    budget = MagicMock()
    budget.consume.return_value = True
    app.dependency_overrides[chat_route.get_answer_budget] = lambda: budget

    first = await _ask()
    second = await _ask()

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"].startswith("You've asked your questions for today.")
    assert "about 24 hours" in second.json()["detail"]
    assert 86000 < int(second.headers["Retry-After"]) <= 86400
    assert budget.consume.call_count == 1


async def test_one_readers_share_leaves_other_readers_theirs(wire, monkeypatch) -> None:
    wire(_llm(tokens=["Box"]))
    monkeypatch.setattr(
        chat_route,
        "_reader_day_limiter",
        SlidingWindowLimiter(per_key=1, global_limit=100, window_seconds=86400),
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        async def ask(ip: str) -> int:
            response = await client.post(
                "/api/v1/chat",
                json={"message": "Who won Monza in 2025?"},
                headers={"cf-connecting-ip": ip},
            )
            return response.status_code

        assert await ask("203.0.113.1") == 200
        assert await ask("203.0.113.1") == 429
        assert await ask("203.0.113.2") == 200


async def test_a_question_the_day_refuses_leaves_the_readers_share(
    wire, monkeypatch
) -> None:
    wire(_llm(tokens=["Box"]))
    monkeypatch.setattr(
        chat_route,
        "_reader_day_limiter",
        SlidingWindowLimiter(per_key=1, global_limit=100, window_seconds=86400),
    )
    budget = MagicMock()
    budget.consume.side_effect = [False, True]
    app.dependency_overrides[chat_route.get_answer_budget] = lambda: budget

    refused = await _ask()
    answered = await _ask()

    assert refused.status_code == 429
    assert refused.json()["detail"].startswith("PitWall has given all of today's")
    assert answered.status_code == 200
