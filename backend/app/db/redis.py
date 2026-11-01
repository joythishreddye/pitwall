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
