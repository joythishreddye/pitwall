"""Provider-agnostic LLM interface. Routes depend on this, never on an SDK."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass
class Message:
    role: str  # "system", "user", "assistant"
    content: str


class LLMError(Exception):
    """A provider call failed.

    Providers translate their SDK's exceptions into this one so callers can
    handle failures without importing a specific SDK.
    """

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code

    @property
    def rate_limited(self) -> bool:
        """True when the provider asked us to slow down."""
        return self.status_code == 429


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    model: str

    @abstractmethod
    async def generate(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        json_mode: bool = False,
    ) -> str:
        """Generate a complete response.

        Args:
            messages: The conversation, oldest first.
            temperature: Sampling temperature.
            max_tokens: Ceiling on generated tokens, including any hidden
                reasoning the model does before answering.
            json_mode: Ask the provider to return a single JSON object.

        Raises:
            LLMError: The provider rejected or failed the request.
        """

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[Message],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        """Stream response tokens.

        Raises:
            LLMError: The provider rejected or failed the request.
        """

    @abstractmethod
    async def health_check(self) -> None:
        """Confirm the configured model can serve requests.

        Raises:
            LLMError: The model is unknown, retired, or unreachable.
        """
