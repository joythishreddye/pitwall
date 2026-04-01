import pytest

from app.llm.base import LLMProvider
from app.llm.factory import create_llm
from app.llm.groq import GroqProvider


def test_create_llm_groq(monkeypatch):
    """Factory should return GroqProvider when provider is 'groq'."""
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")

    from app.config import Settings

    monkeypatch.setattr("app.llm.factory.settings", Settings())

    provider = create_llm()
    assert isinstance(provider, GroqProvider)
    assert isinstance(provider, LLMProvider)


def test_create_llm_unknown_raises(monkeypatch):
    """Factory should raise ValueError for unknown providers."""
    from app.config import Settings

    monkeypatch.setattr(
        "app.llm.factory.settings",
        Settings(**{"llm_provider": "unknown"}),
    )

    with pytest.raises(ValueError, match="Unknown LLM provider"):
        create_llm()
