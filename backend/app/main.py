import asyncio
import hmac
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, Header, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import chat, drivers, notify, races, seasons, standings
from app.config import settings
from app.db.redis import get_redis, ping_redis
from app.db.supabase import get_supabase, ping_supabase
from app.llm.factory import create_llm
from app.rag.budget import ApiBudget
from app.rag.entities import EntityLinker
from app.rag.query_embedder import EmbeddingUnavailable, QueryEmbedder

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Create shared clients. Dependency outages degrade service, never block boot."""
    supabase = get_supabase()
    app.state.supabase = supabase
    app.state.redis = get_redis()
    app.state.llm = create_llm()
    app.state.intent_llm = create_llm(settings.llm_intent_model)
    app.state.budget = ApiBudget(supabase, settings.hf_monthly_call_limit)
    app.state.embedder = QueryEmbedder(budget=app.state.budget)

    try:
        ping_supabase()
    except Exception:
        logger.exception("Supabase unreachable at startup; /health/ready reports it")
    try:
        app.state.linker = EntityLinker.from_db(supabase)
    except Exception:
        logger.exception("Entity linker unavailable; using raw classifier filters")
        app.state.linker = None
    ping_redis()
    logger.info("Startup complete (LLM model: %s)", settings.llm_model)

    yield

    app.state.embedder.close()


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
app.include_router(notify.router, prefix=API_PREFIX)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Liveness: the process is up. Says nothing about dependencies."""
    return {"status": "ok", "version": app.version}


_READY_CACHE_SECONDS = 30.0
_ready_cache: dict[str, Any] = {}


async def _probe(check: Callable[[], Awaitable[object]]) -> str:
    """Run one readiness check and name its outcome."""
    try:
        await check()
    except EmbeddingUnavailable:
        return "unavailable"
    except Exception:
        logger.exception("Readiness probe failed")
        return "error"
    return "ok"


@app.get("/health/ready")
async def readiness(
    request: Request,
    response: Response,
    deep: bool = False,
    x_health_token: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Readiness: can the API answer chat questions right now?

    Checks the database and the configured LLM model, and reports the
    embedding service's last known state plus this month's HuggingFace usage.
    Results are cached for 30 seconds so the endpoint can't amplify load.
    ``deep=true`` also makes one real, uncached embedding call and requires
    the ``X-Health-Token`` header. Keep Render's health check on ``/health``:
    a degraded dependency shouldn't get the service restarted.
    """
    if deep:
        expected = settings.health_check_token
        if not (
            expected
            and x_health_token
            and hmac.compare_digest(x_health_token.encode(), expected.encode())
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Deep readiness checks need a valid X-Health-Token header.",
            )
    else:
        cached = _ready_cache.get("shallow")
        if cached and time.monotonic() - cached["at"] < _READY_CACHE_SECONDS:
            response.status_code = cached["code"]
            return cached["body"]

    state = request.app.state
    llm = getattr(state, "llm", None)
    intent_llm = getattr(state, "intent_llm", None) or llm
    embedder = getattr(state, "embedder", None)
    budget = getattr(state, "budget", None)

    checks = {
        "database": await _probe(lambda: asyncio.to_thread(ping_supabase)),
        "llm": await _probe(llm.health_check) if llm else "error",
        "intent_llm": await _probe(intent_llm.health_check) if intent_llm else "error",
    }
    if embedder is None:
        checks["embeddings"] = "error"
    elif deep:
        checks["embeddings"] = await _probe(
            lambda: asyncio.to_thread(
                embedder.embed_query, "readiness probe", use_cache=False
            )
        )
    else:
        checks["embeddings"] = embedder.status

    ready = (
        checks["database"] == "ok"
        and checks["llm"] == "ok"
        and checks["intent_llm"] == "ok"
        and checks["embeddings"] in {"ok", "unknown"}
    )
    used = await asyncio.to_thread(budget.used_this_month) if budget else None
    body = {
        "status": "ready" if ready else "degraded",
        "checks": checks,
        "llm_model": settings.llm_model,
        "intent_model": settings.llm_intent_model,
        "hf_calls_this_month": used,
        "hf_monthly_limit": settings.hf_monthly_call_limit,
    }
    code = status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE
    response.status_code = code
    if not deep:
        _ready_cache["shallow"] = {"at": time.monotonic(), "code": code, "body": body}
    return body
