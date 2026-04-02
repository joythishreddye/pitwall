"""Chat router — SSE streaming RAG chat endpoint."""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Annotated

import groq
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from supabase import Client

from app.db.supabase import get_supabase
from app.llm.base import LLMProvider, Message
from app.rag.embedder import Embedder
from app.rag.prompt import build_rag_prompt
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
                f"P{row['position']}. {name}"
                f" — {row['points']} pts ({row['wins']} wins)"
            )
        return "\n".join(lines)
    except Exception:
        logger.exception("Failed to fetch standings for chat context")
        return None


# ---------------------------------------------------------------------------
# Knowledge level detection
# ---------------------------------------------------------------------------

_EXPERT_TERMS = frozenset({
    "undercut", "overcut", "degradation", "graining", "blistering",
    "downforce", "drag", "dirty air", "ground effect", "diffuser",
    "ers", "mgu-k", "mgu-h", "drs zone", "delta", "stint",
    "compound", "crossover", "porpoising", "parc ferme", "aero",
    "setup", "rake", "ride height", "floor", "bargeboard",
    "tyre blanket", "fuel load", "lift and coast", "deployment",
    "harvesting", "sector time", "purple sector", "flat spot",
    "lockup", "active aero", "sustainable fuel",
})

_BEGINNER_MARKERS = frozenset({
    "what is", "what are", "explain", "how does", "what does",
    "who is", "tell me about", "basics", "beginner", "new to f1",
    "simple", "easy to understand",
})


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


@router.post("")
async def chat(body: ChatRequest, db: DB, llm: LLM) -> StreamingResponse:
    """Stream a RAG-powered chat response via SSE."""
    embedder = Embedder.get()
    retriever = Retriever(db=db, llm=llm, embedder=embedder)

    # 1. Retrieve relevant context via 3-stage RAG
    chunks = await retriever.retrieve(body.message)

    # 2. Fetch current standings for live context (sync → thread)
    standings_context = await asyncio.to_thread(
        _fetch_current_standings_sync, db,
    )

    # 3. Build conversation history (Pydantic enforces max_length=6)
    history_messages = [
        Message(role=h.role, content=h.content) for h in body.history
    ]

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
    sources = [
        {"source": c.source, "content": c.content[:150]}
        for c in chunks
    ]

    async def event_stream() -> AsyncIterator[str]:
        # First event: sources + knowledge level metadata
        meta = {
            "type": "sources",
            "data": sources,
            "knowledge_level": knowledge_level,
        }
        yield f"data: {json.dumps(meta)}\n\n"

        # Stream tokens from LLM
        try:
            async for token in llm.stream_chat(
                messages, temperature=0.4, max_tokens=1024,
            ):
                yield (
                    f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"
                )
        except groq.APIError as exc:
            logger.error("Groq API error: %s (status=%s)", exc.message, exc.status_code)
            err_event = {
                "type": "error",
                "data": f"LLM API error ({exc.status_code}) — please try again.",
            }
        except groq.APIConnectionError:
            logger.error("Groq connection error — network unreachable")
            err_event = {
                "type": "error",
                "data": "Could not reach the LLM service — please try again.",
            }
        except Exception:
            logger.exception("LLM streaming error")
            err_event = {
                "type": "error",
                "data": "Stream interrupted — please try again.",
            }
            yield f"data: {json.dumps(err_event)}\n\n"
            return

        # Done signal
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
