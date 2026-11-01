"""Optional Upstash Redis client.

Nothing depends on Redis yet, so a missing or unreachable instance must never
stop the API from starting.
"""

import logging

from upstash_redis import Redis

from app.config import settings

logger = logging.getLogger(__name__)

_client: Redis | None = None


def get_redis() -> Redis | None:
    """Return a singleton Upstash Redis client, or None when it isn't configured."""
    global _client
    url = settings.upstash_redis_rest_url
    token = settings.upstash_redis_rest_token
    if _client is None and url and token:
        _client = Redis(url=url, token=token)
    return _client


def ping_redis() -> bool:
    """Check Redis connectivity without ever raising.

    Returns:
        True if Redis answered, False if it is unconfigured or unreachable.
    """
    client = get_redis()
    if client is None:
        logger.info("Redis not configured; continuing without it")
        return False
    try:
        client.ping()
    except Exception as exc:
        logger.warning("Redis unreachable (%s); continuing without it", exc)
        return False
    logger.info("Redis connection verified")
    return True
