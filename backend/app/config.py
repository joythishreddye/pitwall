from typing import Annotated, Literal

from pydantic import Field, StringConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict

# A model id from env: trimmed, and never blank.
ModelId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        # A startup error must not print the settings it read: Render logs it,
        # and pydantic would show the merged values, ending with a secret's tail.
        hide_input_in_errors=True,
    )

    # Supabase
    supabase_url: str
    supabase_service_role_key: str

    # Upstash Redis (optional: nothing depends on it yet)
    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None

    # LLM
    llm_provider: str = "groq"
    # Model ids are required, from env (LLM_MODEL, LLM_INTENT_MODEL), with no
    # code default: a missing or blank one fails at startup instead of running
    # a model the provider may have retired (Groq shut Llama 3.3 70B down on
    # 2026-08-16).
    llm_model: ModelId
    # Smaller model for intent/entity extraction. Groq rate-limits each model
    # separately, so this keeps the answer model's token budget for answers.
    llm_intent_model: ModelId
    llm_reasoning_effort: Literal["low", "medium", "high"] = "low"
    # Seconds the chat waits for the intent model before going on without it
    # (the linker's own name scan builds the filter). Groq's SDK retries a 429
    # twice, sleeping up to 60 s each time it's told to wait, so without a
    # limit a rate-limited minute could hold an answer for two minutes. 0 waits
    # as long as the call takes (the eval, which waits out limits on purpose).
    intent_timeout_seconds: float = Field(default=8.0, ge=0)
    groq_api_key: str | None = None
    anthropic_api_key: str | None = None

    # Embeddings (HuggingFace Inference Providers, query time)
    huggingface_api_token: str | None = None
    # Hard ceiling on billable HuggingFace requests per UTC month. Counted in
    # Postgres so it survives restarts. 0 disables HuggingFace calls entirely.
    hf_monthly_call_limit: int = Field(default=5000, ge=0)
    # Cross-encoder reranking. Off: on the 55-question eval it lost a question
    # plain vector search found (hit@5 100% -> 98.2%), ranked the rest worse
    # (MRR@5 0.912 -> 0.735) and added ~0.9 s plus HF spend. See the README.
    rerank_enabled: bool = False

    # Chat abuse protection: requests per minute, per client and overall.
    # Groq's free tier gives the answer model 8K tokens a minute and 200K a
    # day; an answer is a prompt of a few thousand tokens plus up to 2,048 of
    # its own (chat.py), so 1 to 3 a minute (shorter answers fit more) and
    # about 40 a day. Estimates: set them from the Groq token log (the "Groq
    # usage" log lines) after a few days. Per client stays under overall, so
    # one client can't take a whole minute's answers.
    chat_rate_limit_per_ip: int = Field(default=2, ge=1)
    chat_rate_limit_global: int = Field(default=3, ge=1)
    # Questions answered per UTC day, counted in Postgres; 0 turns the chat off
    chat_daily_answer_limit: int = Field(default=40, ge=0)
    # Questions one client can ask in any 24 hours, so one reader can't spend
    # the whole day's answers. Kept in memory: a deploy or restart forgets it.
    chat_daily_questions_per_ip: int = Field(default=10, ge=1)

    # Bandwidth guard for every route except /health. Render's Hobby plan includes
    # 5 GB of outbound bandwidth a month, then bills $0.15/GB with no cap.
    # Uncompressed response bytes are counted: 150 MB a day keeps a month
    # under 4.5 GB even for clients that don't accept gzip.
    api_requests_per_minute_per_ip: int = Field(default=120, ge=1)
    api_daily_mb: int = Field(default=150, ge=1)
    api_daily_mb_per_ip: int = Field(default=15, ge=1)

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
