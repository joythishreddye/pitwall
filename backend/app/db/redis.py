import logging

from upstash_redis import Redis

from app.config import settings

logger = logging.getLogger(__name__)

_client: Redis | None = None


def get_redis() -> Redis:
    """Return a singleton Upstash Redis client, creating it on first call."""
    global _client
    if _client is None:
        _client = Redis(
            url=settings.upstash_redis_rest_url,
            token=settings.upstash_redis_rest_token,
        )
    return _client


def ping_redis() -> None:
    """Validate Redis connectivity with a PING command."""
    client = get_redis()
    client.ping()
    logger.info("Redis connection verified")
