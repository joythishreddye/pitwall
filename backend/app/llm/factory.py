from app.config import settings
from app.llm.base import LLMProvider
from app.llm.groq import GroqProvider


def create_llm() -> LLMProvider:
    """Create an LLM provider based on the configured provider setting."""
    provider = settings.llm_provider.lower()

    if provider == "groq":
        return GroqProvider()

    raise ValueError(
        f"Unknown LLM provider: {provider}. Supported: groq"
    )
