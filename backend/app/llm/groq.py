"""Groq-backed LLM provider."""

from collections.abc import AsyncIterator
from typing import Any

import groq
from groq import AsyncGroq

from app.config import settings
from app.llm.base import LLMError, LLMProvider, Message

# Models that spend completion tokens on hidden reasoning before answering.
_REASONING_MODEL_PREFIXES = ("openai/gpt-oss",)


def _to_llm_error(exc: groq.GroqError) -> LLMError:
    """Translate a Groq SDK exception into the provider-agnostic LLMError."""
    if isinstance(exc, groq.APIStatusError):
        return LLMError(
            f"Groq returned {exc.status_code}: {exc.message}",
            status_code=exc.status_code,
        )
    if isinstance(exc, groq.APIConnectionError):
        return LLMError("Could not reach Groq")
    return LLMError(f"Groq request failed: {exc}")


class GroqProvider(LLMProvider):
    """LLM provider backed by Groq's inference API.

    Reasoning models such as gpt-oss think before they answer. For those, the
    provider requests a configurable reasoning effort and asks Groq to leave
    the reasoning out of the response, so callers (and the chat stream) only
    ever see the final answer.
    """

    def __init__(
        self,
        model: str,
        *,
        reasoning_effort: str = "low",
        api_key: str | None = None,
    ) -> None:
        self.client = AsyncGroq(api_key=api_key or settings.groq_api_key)
        self.model = model
        self.reasoning_effort = reasoning_effort

    @property
    def is_reasoning_model(self) -> bool:
        """True when the model reasons before answering (e.g. gpt-oss)."""
        return self.model.startswith(_REASONING_MODEL_PREFIXES)

    def _request(
        self,
        messages: list[Message],
        temperature: float,
        max_tokens: int,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_completion_tokens": max_tokens,
        }
        if self.is_reasoning_model:
            # Not typed in groq 0.25, so pass them through the raw request body.
            request["extra_body"] = {
                "reasoning_effort": self.reasoning_effort,
                "include_reasoning": False,
            }
        return request

    async def generate(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        json_mode: bool = False,
    ) -> str:
        request = self._request(messages, temperature, max_tokens)
        if json_mode:
            request["response_format"] = {"type": "json_object"}
        try:
            response = await self.client.chat.completions.create(**request)
        except groq.GroqError as exc:
            raise _to_llm_error(exc) from exc
        return response.choices[0].message.content or ""

    async def stream_chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        request = self._request(messages, temperature, max_tokens)
        try:
            stream = await self.client.chat.completions.create(**request, stream=True)
            async for chunk in stream:
                if not chunk.choices:  # usage-only chunks carry no choices
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except groq.GroqError as exc:
            raise _to_llm_error(exc) from exc

    async def health_check(self) -> None:
        try:
            await self.client.models.retrieve(self.model)
        except groq.GroqError as exc:
            raise _to_llm_error(exc) from exc
