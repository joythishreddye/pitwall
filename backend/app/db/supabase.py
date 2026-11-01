import logging
from collections.abc import Callable
from typing import Any

from supabase import Client, create_client

from app.config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None

# PostgREST returns at most this many rows per request, whatever .limit() says
PAGE_SIZE = 1000


def fetch_all(build: Callable[[], Any], page_size: int = PAGE_SIZE) -> list[dict]:
    """Read every row of a query, one page at a time.

    PostgREST silently caps each response at 1,000 rows, so a plain
    ``.limit(10000).execute()`` truncates large reads.

    Args:
        build: Returns a fresh query builder ordered on a unique column, so
            pages neither overlap nor skip rows.
        page_size: Rows per request; must not exceed the server's row cap.
    """
    rows: list[dict] = []
    start = 0
    while True:
        page = build().range(start, start + page_size - 1).execute().data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def get_supabase() -> Client:
    """Return a singleton Supabase client, creating it on first call."""
    global _client
    if _client is None:
        _client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _client


def ping_supabase() -> None:
    """Validate Supabase connectivity by running a trivial query."""
    client = get_supabase()
    client.table("circuits").select("id", count="exact").limit(0).execute()
    logger.info("Supabase connection verified")
