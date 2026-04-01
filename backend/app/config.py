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

    # Upstash Redis
    upstash_redis_rest_url: str
    upstash_redis_rest_token: str

    # LLM
    llm_provider: str = "groq"
    groq_api_key: str | None = None
    anthropic_api_key: str | None = None

    # App
    secret_key: str
    debug: bool = False
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://pitwall.vercel.app",
    ]


settings = Settings()
