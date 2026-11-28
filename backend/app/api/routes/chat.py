"""Chat router — SSE streaming RAG chat endpoint."""

import asyncio
import json
import logging
import math
import time
from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.datastructures import State
from supabase import Client

from app.api.rate_limit import SlidingWindowLimiter, client_ip
from app.config import settings
from app.db.supabase import get_supabase
from app.llm.base import LLMError, LLMProvider, Message
from app.rag.budget import ApiBudget, DailyBudget, seconds_to_next_day
from app.rag.entities import EntityLinker
from app.rag.prompt import build_rag_prompt
from app.rag.query_embedder import QueryEmbedder
from app.rag.race_calendar import race_calendar_note, season_rounds
from app.rag.retriever import RaceRef, Retriever
from app.rag.title_note import title_note

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
# A rebuild holds up the request that triggers it, so it gets less time than
# the startup build's 20 s
_LINKER_BUILD_SECONDS = 10.0


def _keep_when_built(state: State) -> Callable[[asyncio.Future], None]:
    """A rebuild's done-callback: log how it ended and keep a non-empty
    linker, even one that finished after its request stopped waiting."""

    def done(build: asyncio.Future) -> None:
        if build.cancelled():
            return
        error = build.exception()
        if error is not None:
            logger.error("Entity linker still unavailable", exc_info=error)
            return
        linker = build.result()
        if linker.is_empty:
            logger.warning("Entity linker built empty; trying again in 5 minutes")
        elif getattr(state, "linker", None) is None:
            state.linker = linker

    return done


def _build_linker() -> EntityLinker:
    return EntityLinker.from_db(get_supabase())


async def get_linker(request: Request) -> EntityLinker | None:
    """Return the entity linker, rebuilding it if startup couldn't.

    A database blip at boot would otherwise leave raw classifier filters in
    place until the next restart. Rebuilds are tried at most every 5 minutes,
    each waited on for 10 s, and a linker built from empty tables isn't kept,
    so the next try can build a real one. A build that outlives its 10 s keeps
    running in its thread and is kept if it finishes; no new one starts
    beside it.
    """
    state = request.app.state
    linker = getattr(state, "linker", None)
    if linker is not None:
        return linker
    building = getattr(state, "linker_build", None)
    if building is not None and not building.done():
        return None
    now = time.monotonic()
    if now - getattr(state, "linker_attempted_at", -_LINKER_RETRY_SECONDS) < (
        _LINKER_RETRY_SECONDS
    ):
        return None
    state.linker_attempted_at = now
    # A task the timeout can't cancel, so it stays not done while its thread
    # runs and its callback still sees the result. The client is made in the
    # thread too, so its errors reach the fallback below.
    build = asyncio.ensure_future(asyncio.to_thread(_build_linker))
    build.add_done_callback(_keep_when_built(state))
    state.linker_build = build
    try:
        linker = await asyncio.wait_for(
            asyncio.shield(build), timeout=_LINKER_BUILD_SECONDS
        )
    except Exception:
        # The build's own errors are logged by its done-callback; a timeout
        # with the build still going is the wait's
        if not build.done():
            logger.warning(
                "Entity linker rebuild still running after %.0f s; kept if it finishes",
                _LINKER_BUILD_SECONDS,
            )
        return None
    if linker.is_empty:
        return None
    state.linker = linker
    return linker


Linker = Annotated[EntityLinker | None, Depends(get_linker)]

_chat_limiter = SlidingWindowLimiter(
    per_key=settings.chat_rate_limit_per_ip,
    global_limit=settings.chat_rate_limit_global,
)


# Each client's share of the day. The day's total is the answer budget's job
# (Postgres); this one only stops a single client from taking all of it. The
# per-minute limit runs first, so it sees a few thousand questions a day at most.
_reader_day_limiter = SlidingWindowLimiter(
    per_key=settings.chat_daily_questions_per_ip,
    global_limit=1_000_000,
    window_seconds=24 * 60 * 60,
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


def enforce_reader_day_limit(request: Request, asked_at: float) -> None:
    """Refuse a client that has asked its share of the day's answers.

    ``asked_at`` (monotonic) is the time the question is counted at, so the
    caller can take it back with ``_reader_day_limiter.release``.
    """
    retry_after = _reader_day_limiter.check(client_ip(request), now=asked_at)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've asked your questions for today. "
            f"Ask again in {_wait_in_words(retry_after)}.",
            headers={"Retry-After": str(max(1, round(retry_after)))},
        )


def get_answer_budget(request: Request) -> DailyBudget | None:
    """Return the daily answer budget, if one is configured."""
    return getattr(request.app.state, "answer_budget", None)


AnswerBudget = Annotated[DailyBudget | None, Depends(get_answer_budget)]


def enforce_daily_answers(budget: AnswerBudget) -> None:
    """Refuse once today's answers are spent, with a clear message rather than
    the model provider's own refusal ("busy") on every try until midnight."""
    if budget is not None and not budget.consume():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="PitWall has given all of today's answers. "
            "Ask again after midnight UTC.",
            headers={"Retry-After": str(seconds_to_next_day())},
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
    # Set when the question is asked from a race page; never part of the text
    race: RaceRef | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _race_name_sync(db: Client, race: RaceRef) -> str | None:
    """The race's name from the races table, or None if it can't be read."""
    try:
        result = (
            db.table("races")
            .select("name")
            .eq("season", race.season)
            .eq("round", race.round)
            .limit(1)
            .execute()
        )
    except Exception:
        logger.warning("Couldn't read the race's name", exc_info=True)
        return None
    rows = result.data
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None
    name = rows[0].get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    return name.strip()[:80]


def _race_note(race: RaceRef, name: str | None) -> str:
    """Tells the model which race page the question came from."""
    which = (
        f"the {race.season} {name} (round {race.round})"
        if name
        else f"round {race.round} of the {race.season} season"
    )
    return (
        f"The reader is asking from the race page of {which}. "
        "A question that names no race is about this race."
    )


def _round_raced(db: Client, season: int, rnd: int) -> bool:
    """Whether the round's Grand Prix result is stored (race_results holds
    Grand Prix results only: standings stored after a round's sprint carry its
    number before its Grand Prix has run)."""
    race = (
        db.table("races")
        .select("id")
        .eq("season", season)
        .eq("round", rnd)
        .limit(1)
        .execute()
    ).data
    if not race:
        return False
    result = (
        db.table("race_results")
        .select("id")
        .eq("race_id", race[0]["id"])
        .limit(1)
        .execute()
    ).data
    return bool(result)


def _fetch_current_standings_sync(db: Client) -> str | None:
    """Fetch latest driver standings for context injection (sync): every
    driver with standings, then whether the title is decided."""
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
        ranked: list[tuple[str, float]] = []
        for row in standings.data:
            d = driver_map.get(row["entity_id"], {})
            name = f"{d.get('forename', '?')} {d.get('surname', '?')}"
            lines.append(
                f"P{row['position']}. {name} — {row['points']} pts ({row['wins']} wins)"
            )
            ranked.append((name, float(row["points"] or 0)))
        schedule = season_rounds(season)
        if schedule:
            note = title_note(
                season, rnd, ranked, schedule, _round_raced(db, season, rnd)
            )
            if note:
                lines.append(note)
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


# Past this, a rate limit is the day's budget, not a burst
_LONG_WAIT_SECONDS = 120


def _wait_in_words(seconds: float) -> str:
    """A wait as the reader would say it: about a minute, about 5 minutes,
    about 3 hours."""
    minutes = math.ceil(seconds / 60)
    if minutes < 2:
        return "about a minute"
    if minutes < 120:
        return f"about {minutes} minutes"
    return f"about {round(seconds / 3600)} hours"


def _llm_error_message(exc: LLMError) -> str:
    """What the reader sees when the model fails mid-answer."""
    if exc.rate_limited:
        # Groq asks for hours once the day's tokens are spent (its limits are
        # per organization, so local runs count too)
        if exc.retry_after is not None and exc.retry_after > _LONG_WAIT_SECONDS:
            return (
                "PitWall has run out of answers for now. "
                f"Ask again in {_wait_in_words(exc.retry_after)}."
            )
        return "PitWall is busy right now. Try again in a minute."
    return "The AI service didn't answer. Try again in a moment."


@router.post("", dependencies=[Depends(enforce_chat_rate_limit)])
async def chat(
    request: Request,
    body: ChatRequest,
    db: DB,
    llm: LLM,
    intent_llm: IntentLLM,
    embedder: Embedder,
    budget: Budget,
    linker: Linker,
    answers: AnswerBudget,
) -> StreamingResponse:
    """Stream a RAG-powered chat response via SSE."""
    # Here, not as route dependencies: FastAPI runs those before it checks the
    # body, so a refused burst or a question that fails its checks would
    # spend one of the day's answers. The client's share comes first, so a
    # question it refuses spends none of the day's, and a question the day
    # refuses gives the client's slot back.
    asked_at = time.monotonic()
    enforce_reader_day_limit(request, asked_at)
    try:
        await asyncio.to_thread(enforce_daily_answers, answers)
    except HTTPException:
        _reader_day_limiter.release(client_ip(request), asked_at)
        raise
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
        chunks = await retriever.retrieve(body.message, race=body.race)
    except Exception:
        logger.exception("Retrieval failed, answering without knowledge context")
        chunks = []
        retriever.last_mode = "none"

    # 2. Fetch current standings for live context (sync → thread)
    standings_context = await asyncio.to_thread(
        _fetch_current_standings_sync,
        db,
    )

    # The weekend's session times, for "When does the race start?" (brief 001's
    # chips): read from the schedule files, so no wait and no database call
    calendar_context = race_calendar_note()

    race_note = None
    if body.race is not None:
        name = await asyncio.to_thread(_race_name_sync, db, body.race)
        race_note = _race_note(body.race, name)

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
        race_note=race_note,
        calendar_context=calendar_context,
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
