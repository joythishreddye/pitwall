from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.redis import get_redis
from app.db.supabase import get_supabase
from app.llm.factory import create_llm


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: initialize connections and warm up
    app.state.supabase = get_supabase()
    app.state.redis = get_redis()
    app.state.llm = create_llm()
    yield
    # Shutdown: cleanup if needed


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


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": app.version}
