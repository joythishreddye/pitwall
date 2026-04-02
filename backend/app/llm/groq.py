from collections.abc import AsyncIterator

from groq import AsyncGroq

from app.config import settings
from app.llm.base import LLMProvider, Message


class GroqProvider(LLMProvider):
    """LLM provider backed by Groq's inference API."""

    def __init__(self, model: str = "llama-3.3-70b-versatile") -> None:
        self.client = AsyncGroq(api_key=settings.groq_api_key)
        self.model = model

    async def generate(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def stream_chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
