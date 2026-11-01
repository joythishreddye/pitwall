"""Chat router — SSE streaming RAG chat endpoint."""

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from supabase import Client

from app.api.rate_limit import SlidingWindowLimiter, client_ip
from app.config import settings
from app.db.supabase import get_supabase
from app.llm.base import LLMError, LLMProvider, Message
from app.rag.budget import ApiBudget
from app.rag.entities import EntityLinker
from app.rag.prompt import build_rag_prompt
from app.rag.query_embedder import QueryEmbedder
from app.rag.retriever import Retriever

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def get_db() -> Client:
    """Return the Supabase singleton client."""
    return get_supabase()


DB = Annotated[Client, Depends(get_db)]


def get_llm(request: Request) -> LLMProvider:
    """Return the LLM provider from app state."""
    return request.app.state.llm


LLM = Annotated[LLMProvider, Depends(get_llm)]


def get_intent_llm(request: Request) -> LLMProvider:
    """Return the intent-extraction model, falling back to the main model."""
    return getattr(request.app.state, "intent_llm", None) or request.app.state.llm


IntentLLM = Annotated[LLMProvider, Depends(get_intent_llm)]


def get_embedder(request: Request) -> QueryEmbedder:
    """Return the shared query embedder; its cache spans requests."""
    return request.app.state.embedder


Embedder = Annotated[QueryEmbedder, Depends(get_embedder)]


def get_budget(request: Request) -> ApiBudget | None:
    """Return the HuggingFace call budget, if one is configured."""
    return getattr(request.app.state, "budget", None)


Budget = Annotated[ApiBudget | None, Depends(get_budget)]


_LINKER_RETRY_SECONDS = 300.0


def get_linker(request: Request) -> EntityLinker | None:
    """Return the entity linker, rebuilding it if startup couldn't.

    A database blip at boot would otherwise leave raw classifier filters in
    place until the next restart. Rebuilds are tried at most every 5 minutes.
    """
    state = request.app.state
    linker = getattr(state, "linker", None)
    if linker is not None:
        return linker
    now = time.monotonic()
    if now - getattr(state, "linker_attempted_at", -_LINKER_RETRY_SECONDS) < (
        _LINKER_RETRY_SECONDS
    ):
        return None
    state.linker_attempted_at = now
    try:
        state.linker = EntityLinker.from_db(get_supabase())
    except Exception:
        logger.exception("Entity linker still unavailable")
        return None
    return state.linker


Linker = Annotated[EntityLinker | None, Depends(get_linker)]

_chat_limiter = SlidingWindowLimiter(
    per_key=settings.chat_rate_limit_per_ip,
    global_limit=settings.chat_rate_limit_global,
)


def enforce_chat_rate_limit(request: Request) -> None:
    """Reject bursts that would drain the shared LLM and embedding quotas."""
    retry_after = _chat_limiter.check(client_ip(request))
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many questions in a short time. Try again in a minute.",
            headers={"Retry-After": str(max(1, round(retry_after)))},
        )


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class HistoryMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=6)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fetch_current_standings_sync(db: Client) -> str | None:
    """Fetch latest driver standings for context injection (sync)."""
    try:
        result = (
            db.table("standings")
            .select("entity_id, position, points, wins, season, round")
            .eq("type", "driver")
            .order("season", desc=True)
            .order("round", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None

        # Get the latest season/round to filter exactly
        latest = result.data[0]
        season, rnd = latest["season"], latest["round"]

        standings = (
            db.table("standings")
            .select("entity_id, position, points, wins")
            .eq("type", "driver")
            .eq("season", season)
            .eq("round", rnd)
            .order("position")
            .limit(20)
            .execute()
        )
        if not standings.data:
            return None

        # Get driver names for the entity IDs
        driver_ids = [r["entity_id"] for r in standings.data]
        drivers = (
            db.table("drivers")
            .select("id, forename, surname, code")
            .in_("id", driver_ids)
            .execute()
        )
        driver_map = {d["id"]: d for d in drivers.data}

        lines = [f"Season {season}, Round {rnd}:"]
        for row in standings.data:
            d = driver_map.get(row["entity_id"], {})
            name = f"{d.get('forename', '?')} {d.get('surname', '?')}"
            lines.append(
                f"P{row['position']}. {name} — {row['points']} pts ({row['wins']} wins)"
            )
        return "\n".join(lines)
    except Exception:
        logger.exception("Failed to fetch standings for chat context")
        return None


# ---------------------------------------------------------------------------
# Knowledge level detection
# ---------------------------------------------------------------------------

_EXPERT_TERMS = frozenset(
    {
        "undercut",
        "overcut",
        "degradation",
        "graining",
        "blistering",
        "downforce",
        "drag",
        "dirty air",
        "ground effect",
        "diffuser",
        "ers",
        "mgu-k",
        "mgu-h",
        "drs zone",
        "delta",
        "stint",
        "compound",
        "crossover",
        "porpoising",
        "parc ferme",
        "aero",
        "setup",
        "rake",
        "ride height",
        "floor",
        "bargeboard",
        "tyre blanket",
        "fuel load",
        "lift and coast",
        "deployment",
        "harvesting",
        "sector time",
        "purple sector",
        "flat spot",
        "lockup",
        "active aero",
        "sustainable fuel",
    }
)

_BEGINNER_MARKERS = frozenset(
    {
        "what is",
        "what are",
        "explain",
        "how does",
        "what does",
        "who is",
        "tell me about",
        "basics",
        "beginner",
        "new to f1",
        "simple",
        "easy to understand",
    }
)


def _detect_knowledge_level(message: str) -> str:
    """Classify user knowledge level from message vocabulary."""
    lower = message.lower()
    expert_hits = sum(1 for t in _EXPERT_TERMS if t in lower)
    beginner_hits = sum(1 for m in _BEGINNER_MARKERS if m in lower)

    if expert_hits >= 2:
        return "expert"
    if beginner_hits >= 1 and expert_hits == 0:
        return "beginner"
    return "intermediate"


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _llm_error_message(exc: LLMError) -> str:
    """What the reader sees when the model fails mid-answer."""
    if exc.rate_limited:
        return "PitWall is busy right now. Try again in a minute."
    return "The AI service didn't answer. Try again in a moment."


@router.post("", dependencies=[Depends(enforce_chat_rate_limit)])
async def chat(
    body: ChatRequest,
    db: DB,
    llm: LLM,
    intent_llm: IntentLLM,
    embedder: Embedder,
    budget: Budget,
    linker: Linker,
) -> StreamingResponse:
    """Stream a RAG-powered chat response via SSE."""
    retriever = Retriever(
        db=db,
        llm=intent_llm,
        embedder=embedder,
        budget=budget,
        linker=linker,
        rerank_enabled=settings.rerank_enabled,
    )

    # 1. Retrieve relevant context via 3-stage RAG. The retriever already
    # degrades on its own (full-text fallback); this guard catches the rest.
    try:
        chunks = await retriever.retrieve(body.message)
    except Exception:
        logger.exception("Retrieval failed, answering without knowledge context")
        chunks = []
        retriever.last_mode = "none"

    # 2. Fetch current standings for live context (sync → thread)
    standings_context = await asyncio.to_thread(
        _fetch_current_standings_sync,
        db,
    )

    # 3. Build conversation history (Pydantic enforces max_length=6)
    history_messages = [Message(role=h.role, content=h.content) for h in body.history]

    # 4. Build prompt
    chunk_dicts = [
        {"content": c.content, "source": c.source, "metadata": c.metadata}
        for c in chunks
    ]
    messages = build_rag_prompt(
        query=body.message,
        chunks=chunk_dicts,
        standings_context=standings_context,
        history=history_messages,
    )

    # 5. Detect knowledge level
    knowledge_level = _detect_knowledge_level(body.message)

    # 6. Prepare source attribution
    sources = [{"source": c.source, "content": c.content[:150]} for c in chunks]

    retrieval_mode = retriever.last_mode

    async def event_stream() -> AsyncIterator[str]:
        # First event: sources, knowledge level and how context was found
        yield _sse(
            {
                "type": "sources",
                "data": sources,
                "knowledge_level": knowledge_level,
                "retrieval": retrieval_mode,
            }
        )

        # Stream tokens from the LLM. Every failure ends with an error event,
        # so the reader never sees a silent, empty answer.
        produced = False
        try:
            async for token in llm.stream_chat(
                messages,
                temperature=0.4,
                max_tokens=2048,  # reasoning models spend part of this thinking
            ):
                produced = True
                yield _sse({"type": "token", "data": token})
        except LLMError as exc:
            logger.error("LLM stream failed: %s", exc)
            yield _sse({"type": "error", "data": _llm_error_message(exc)})
            return
        except Exception:
            logger.exception("LLM streaming error")
            yield _sse(
                {"type": "error", "data": "The answer was cut off. Please ask again."}
            )
            return

        if not produced:
            # e.g. a reasoning model spent its whole budget thinking
            logger.warning("LLM returned an empty answer")
            yield _sse(
                {
                    "type": "error",
                    "data": "The race engineer didn't come back with an answer. "
                    "Try asking another way.",
                }
            )
            return

        yield _sse({"type": "done"})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
