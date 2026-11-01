from app.config import settings
from app.llm.base import LLMProvider
from app.llm.groq import GroqProvider


def create_llm(model: str | None = None) -> LLMProvider:
    """Create an LLM provider from the configured provider, model and effort.

    Args:
        model: Override the configured answer model (e.g. the intent model).
    """
    provider = settings.llm_provider.lower()

    if provider == "groq":
        return GroqProvider(
            model=model or settings.llm_model,
            reasoning_effort=settings.llm_reasoning_effort,
        )

    raise ValueError(f"Unknown LLM provider: {provider}. Supported: groq")
