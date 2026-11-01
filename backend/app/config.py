from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Upstash Redis (optional: nothing depends on it yet)
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None

    # LLM
    llm_provider: str = "groq"
    llm_model: str = "openai/gpt-oss-120b"
    # Smaller model for intent/entity extraction. Groq rate-limits each model
    # separately, so this keeps the answer model's token budget for answers.
    llm_intent_model: str = "openai/gpt-oss-20b"
    llm_reasoning_effort: Literal["low", "medium", "high"] = "low"
    groq_api_key: str | None = None
    anthropic_api_key: str | None = None

    # Embeddings (HuggingFace Inference Providers, query time)
    huggingface_api_token: str | None = None
    # Hard ceiling on billable HuggingFace requests per UTC month. Counted in
    # Postgres so it survives restarts. 0 disables HuggingFace calls entirely.
    hf_monthly_call_limit: int = Field(default=5000, ge=0)
    # Cross-encoder reranking. Off: on the 55-question eval it lowered hit@5
    # (100% -> 96.4%) and MRR (0.912 -> 0.717) while adding ~0.9s and HF spend.
    # See backend/evals/results and the README's retrieval table.
    rerank_enabled: bool = False

    # Chat abuse protection: requests per minute, per client and overall
    chat_rate_limit_per_ip: int = Field(default=6, ge=1)
    chat_rate_limit_global: int = Field(default=20, ge=1)

    # Data ingestion
    fastf1_cache_dir: str = "fastf1_cache"

    # App
    secret_key: str
    # Shared secret for deep readiness checks (smoke tests, keep-alive cron)
    health_check_token: str | None = None
    debug: bool = False
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://pitwall.vercel.app",
        "https://pitwall-teal.vercel.app",
    ]


settings = Settings()
