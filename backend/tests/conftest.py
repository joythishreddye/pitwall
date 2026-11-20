import os

# Set required env vars before any app imports
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("LLM_PROVIDER", "groq")
os.environ.setdefault("GROQ_API_KEY", "gsk_test")
os.environ.setdefault("LLM_MODEL", "openai/gpt-oss-120b")
os.environ.setdefault("LLM_INTENT_MODEL", "openai/gpt-oss-20b")


import pytest


@pytest.fixture(autouse=True)
def _fresh_traffic_budget() -> None:
    """Each test starts with an empty API bandwidth budget."""
    from app.main import traffic_budget

    traffic_budget.reset()
