import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, drivers, races, seasons, standings
from app.config import settings
from app.db.redis import get_redis, ping_redis
from app.db.supabase import get_supabase, ping_supabase
from app.llm.factory import create_llm

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize clients and validate connections on startup."""
    app.state.supabase = get_supabase()
    app.state.redis = get_redis()
    app.state.llm = create_llm()

    # Validate connections before accepting traffic
    ping_supabase()
    ping_redis()

    logger.info("All connections verified — ready to serve")

    yield


app = FastAPI(
    title="PitWall API",
    description="AI Race Engineer — F1 intelligence platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


API_PREFIX = "/api/v1"

app.include_router(seasons.router, prefix=API_PREFIX)
app.include_router(races.router, prefix=API_PREFIX)
app.include_router(standings.router, prefix=API_PREFIX)
app.include_router(drivers.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Return service status and version."""
    return {"status": "ok", "version": app.version}
