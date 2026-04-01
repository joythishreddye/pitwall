import logging

from supabase import Client, create_client

from app.config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None


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
