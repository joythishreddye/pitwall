"""GroqProvider: reasoning-model handling, streaming and error translation."""

from unittest.mock import AsyncMock, MagicMock

import groq
import httpx
import pytest
from groq.types import CompletionUsage
from groq.types.chat import ChatCompletionChunk

from app.llm.base import LLMError, Message
from app.llm.groq import GroqProvider

_URL = "https://api.groq.com/openai/v1/chat/completions"


def _provider(model: str = "openai/gpt-oss-120b") -> GroqProvider:
    provider = GroqProvider(model=model, reasoning_effort="low", api_key="gsk_test")
    provider.client = MagicMock()
    provider.client.chat.completions.create = AsyncMock()
    provider.client.models.retrieve = AsyncMock()
    return provider


def _completion(content: str) -> MagicMock:
    return MagicMock(
        choices=[MagicMock(message=MagicMock(content=content))], usage=None
    )


def _usage(prompt: int, completion: int) -> CompletionUsage:
    return CompletionUsage(
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=prompt + completion,
    )


def _chunk(
    content: str | None, usage: CompletionUsage | None = None
) -> ChatCompletionChunk:
    """A real SDK stream chunk; Groq puts the totals under x_groq on the last one."""
    return ChatCompletionChunk.model_validate(
        {
            "id": "chatcmpl-test",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "openai/gpt-oss-120b",
            "choices": [
                {"index": 0, "delta": {"content": content}, "finish_reason": None}
            ],
            "x_groq": {
                "id": "req_test",
                "usage": usage and usage.model_dump(),
                "error": None,
            },
        }
    )


def _status_error(cls: type[groq.APIStatusError], code: int) -> groq.APIStatusError:
    request = httpx.Request("POST", _URL)
    response = httpx.Response(code, request=request, json={"error": {"message": "x"}})
    return cls("x", response=response, body=None)


async def test_reasoning_model_hides_reasoning_and_uses_json_mode() -> None:
    provider = _provider()
    provider.client.chat.completions.create.return_value = _completion('{"a": 1}')

    out = await provider.generate(
        [Message("user", "hi")], max_tokens=512, json_mode=True
    )

    kwargs = provider.client.chat.completions.create.call_args.kwargs
    assert out == '{"a": 1}'
    assert kwargs["model"] == "openai/gpt-oss-120b"
    assert kwargs["max_completion_tokens"] == 512
    assert kwargs["response_format"] == {"type": "json_object"}
    assert kwargs["extra_body"] == {
        "reasoning_effort": "low",
        "include_reasoning": False,
    }


async def test_non_reasoning_model_sends_no_reasoning_params() -> None:
    provider = _provider("llama-3.1-8b-instant")
    provider.client.chat.completions.create.return_value = _completion("ok")

    await provider.generate([Message("user", "hi")])

    kwargs = provider.client.chat.completions.create.call_args.kwargs
    assert "extra_body" not in kwargs
    assert "response_format" not in kwargs


async def test_stream_skips_chunks_without_choices_or_content() -> None:
    async def fake_stream():
        yield MagicMock(choices=[])
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content="Box"))])
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content=None))])
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content=", box"))])

    provider = _provider()
    provider.client.chat.completions.create.return_value = fake_stream()

    tokens = [t async for t in provider.stream_chat([Message("user", "pit?")])]

    assert tokens == ["Box", ", box"]
    assert provider.client.chat.completions.create.call_args.kwargs["stream"] is True


async def test_retired_model_becomes_llm_error_with_status() -> None:
    provider = _provider()
    provider.client.chat.completions.create.side_effect = _status_error(
        groq.NotFoundError, 404
    )

    with pytest.raises(LLMError) as info:
        await provider.generate([Message("user", "hi")])

    assert info.value.status_code == 404
    assert not info.value.rate_limited


async def test_rate_limit_is_flagged() -> None:
    provider = _provider()
    provider.client.chat.completions.create.side_effect = _status_error(
        groq.RateLimitError, 429
    )

    with pytest.raises(LLMError) as info:
        await provider.generate([Message("user", "hi")])

    assert info.value.rate_limited


async def test_connection_error_becomes_llm_error() -> None:
    provider = _provider()
    provider.client.chat.completions.create.side_effect = groq.APIConnectionError(
        request=httpx.Request("POST", _URL)
    )

    with pytest.raises(LLMError) as info:
        await provider.generate([Message("user", "hi")])

    assert info.value.status_code is None


async def test_stream_errors_become_llm_error() -> None:
    provider = _provider()
    provider.client.chat.completions.create.side_effect = _status_error(
        groq.InternalServerError, 503
    )

    with pytest.raises(LLMError):
        async for _ in provider.stream_chat([Message("user", "hi")]):
            pass


async def test_health_check_reports_retired_model() -> None:
    provider = _provider()
    provider.client.models.retrieve.side_effect = _status_error(groq.NotFoundError, 404)

    with pytest.raises(LLMError):
        await provider.health_check()
    provider.client.models.retrieve.assert_awaited_once_with("openai/gpt-oss-120b")


async def test_generate_logs_token_usage(caplog: pytest.LogCaptureFixture) -> None:
    provider = _provider("openai/gpt-oss-20b")
    response = _completion("ok")
    response.usage = _usage(900, 120)
    provider.client.chat.completions.create.return_value = response

    with caplog.at_level("INFO", logger="app.llm.groq"):
        await provider.generate([Message("user", "hi")])

    expected = "model=openai/gpt-oss-20b prompt=900 completion=120 total=1020"
    assert f"groq usage {expected}" in caplog.text


async def test_stream_logs_usage_from_the_last_chunk(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def fake_stream():
        yield _chunk("Box")
        yield _chunk(None, usage=_usage(1500, 400))

    provider = _provider()
    provider.client.chat.completions.create.return_value = fake_stream()

    with caplog.at_level("INFO", logger="app.llm.groq"):
        tokens = [t async for t in provider.stream_chat([Message("user", "pit?")])]

    assert tokens == ["Box"]
    assert (
        "groq usage model=openai/gpt-oss-120b prompt=1500 completion=400 total=1900"
        in caplog.text
    )


async def test_stream_without_usage_logs_nothing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def fake_stream():
        yield _chunk("Box")

    provider = _provider()
    provider.client.chat.completions.create.return_value = fake_stream()

    with caplog.at_level("INFO", logger="app.llm.groq"):
        tokens = [t async for t in provider.stream_chat([Message("user", "pit?")])]

    assert tokens == ["Box"]
    assert "groq usage" not in caplog.text


async def test_stream_logs_top_level_usage_from_a_usage_only_chunk(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # The OpenAI-style form: a last chunk with no choices and usage at the top.
    last = _chunk(None).model_copy(update={"choices": [], "usage": _usage(800, 50)})

    async def fake_stream():
        yield _chunk("Box")
        yield last

    provider = _provider()
    provider.client.chat.completions.create.return_value = fake_stream()

    with caplog.at_level("INFO", logger="app.llm.groq"):
        tokens = [t async for t in provider.stream_chat([Message("user", "pit?")])]

    assert tokens == ["Box"]
    assert "prompt=800 completion=50 total=850" in caplog.text


async def test_generate_without_usage_logs_nothing(
    caplog: pytest.LogCaptureFixture,
) -> None:
    provider = _provider()
    provider.client.chat.completions.create.return_value = _completion("ok")

    with caplog.at_level("INFO", logger="app.llm.groq"):
        await provider.generate([Message("user", "hi")])

    assert "groq usage" not in caplog.text
