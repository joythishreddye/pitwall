import pytest
from pydantic import ValidationError


def test_settings_loads_from_env(monkeypatch):
    """Settings should load all required fields from environment."""
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://x.upstash.io")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "token")
    monkeypatch.setenv("SECRET_KEY", "secret")

    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.supabase_url == "https://x.supabase.co"
    assert s.llm_provider == "groq"
    assert s.debug is False


def test_settings_optional_api_keys(monkeypatch):
    """groq_api_key and anthropic_api_key should default to None."""
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://x.upstash.io")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "token")
    monkeypatch.setenv("SECRET_KEY", "secret")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.groq_api_key is None
    assert s.anthropic_api_key is None


def test_settings_missing_required_raises(monkeypatch):
    """Missing required fields should raise ValidationError."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)

    from app.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
