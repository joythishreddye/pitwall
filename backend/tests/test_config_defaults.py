"""Settings defaults added for the Phase 0 revival."""

import pytest

from app.config import Settings


@pytest.fixture
def required_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "key")
    monkeypatch.setenv("SECRET_KEY", "secret")
    monkeypatch.setenv("LLM_MODEL", "answer-model")
    monkeypatch.setenv("LLM_INTENT_MODEL", "intent-model")
    for name in (
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "LLM_REASONING_EFFORT",
        "HF_MONTHLY_CALL_LIMIT",
        "HEALTH_CHECK_TOKEN",
    ):
        monkeypatch.delenv(name, raising=False)


def test_redis_is_optional(required_env) -> None:
    s = Settings(_env_file=None)
    assert s.upstash_redis_rest_url is None
    assert s.upstash_redis_rest_token is None


def test_llm_models_come_from_env_with_low_effort(required_env) -> None:
    s = Settings(_env_file=None)
    assert s.llm_model == "answer-model"
    assert s.llm_intent_model == "intent-model"
    assert s.llm_reasoning_effort == "low"


@pytest.mark.parametrize("missing", ["LLM_MODEL", "LLM_INTENT_MODEL"])
def test_a_missing_model_id_fails_at_startup(
    required_env, monkeypatch, missing
) -> None:
    # No code default: a retired model must not keep running unnoticed
    # (Groq shut Llama 3.3 70B down on 2026-08-16).
    monkeypatch.delenv(missing)
    with pytest.raises(ValueError, match=missing.lower()):
        Settings(_env_file=None)


@pytest.mark.parametrize("blank", ["LLM_MODEL", "LLM_INTENT_MODEL"])
def test_a_blank_model_id_fails_at_startup(required_env, monkeypatch, blank) -> None:
    # A placeholder like LLM_INTENT_MODEL= must not pass either: the factory
    # would fall back to the answer model and share its rate limit.
    monkeypatch.setenv(blank, "")
    with pytest.raises(ValueError, match=blank.lower()):
        Settings(_env_file=None)


def test_spend_and_abuse_guards_have_safe_defaults(required_env) -> None:
    s = Settings(_env_file=None)
    assert s.hf_monthly_call_limit == 5000
    assert s.rerank_enabled is False
    assert s.chat_rate_limit_per_ip == 6
    assert s.chat_rate_limit_global == 20
    assert s.health_check_token is None


def test_rejects_unknown_reasoning_effort(required_env, monkeypatch) -> None:
    monkeypatch.setenv("LLM_REASONING_EFFORT", "extreme")
    with pytest.raises(ValueError):
        Settings(_env_file=None)


def test_rejects_negative_hf_limit(required_env, monkeypatch) -> None:
    monkeypatch.setenv("HF_MONTHLY_CALL_LIMIT", "-1")
    with pytest.raises(ValueError):
        Settings(_env_file=None)
