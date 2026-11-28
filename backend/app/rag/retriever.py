"""Three-stage RAG retrieval: intent classification → vector search → reranking."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client

from app.config import settings
from app.llm.base import LLMError, LLMProvider, Message
from app.rag.budget import ApiBudget
from app.rag.entities import EntityLinker
from app.rag.prompt import INTENT_CLASSIFICATION_PROMPT
from app.rag.query_embedder import EmbeddingUnavailable

logger = logging.getLogger(__name__)

# Full-text cost grows with query terms; the SQL function caps it too
_FULLTEXT_MAX_CHARS = 300

_RERANKER_URL = (
    "https://router.huggingface.co/hf-inference/models/BAAI/bge-reranker-base"
)

# Per kind of entity: the linker's list, the metadata key that marks the
# entity's own documents, and any extra filter. Driver profiles carry their
# team's constructor_ref, so a team search asks for the team doc itself.
_ENTITY_SEARCHES: tuple[tuple[str, str, dict], ...] = (
    ("drivers", "driver_ref", {}),
    ("teams", "constructor_ref", {"category": "team"}),
    ("circuits", "circuit_ref", {}),
)


class RaceRef(BaseModel):
    """The race a question was asked from (its race page): season and round.

    It never joins the question's text, so classification and the main search
    run on the question as typed; the race only gets its page a slot.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    season: int = Field(strict=True, ge=1950, le=2100)
    round: int = Field(strict=True, ge=1, le=30)


# The coverage key for a race page's own race: race docs carry season and round
_RACE_KEY = "race"
# The coverage key for a circuit's own profile, which carries no season
_PROFILE_KEY = "circuit_profile"


def _race_filter(race: RaceRef) -> dict:
    return {"category": "race", "season": race.season, "round": race.round}


def _race_ref(race: RaceRef) -> str:
    return f"{race.season}-r{race.round}"


class SupportsEmbedQuery(Protocol):
    """Any embedder that can embed a query string."""

    def embed_query(self, query: str) -> list[float]: ...


@dataclass
class RetrievedChunk:
    content: str
    metadata: dict
    similarity: float
    source: str


def _no_intent() -> dict:
    """The stand-in when the intent model fails or is too slow: no filter."""
    return {
        "intent": "unknown",
        "entities": {"drivers": [], "teams": [], "circuits": [], "seasons": []},
        "metadata_filter": {},
    }


class Retriever:
    """Three-stage RAG retrieval pipeline."""

    def __init__(
        self,
        db: Client,
        llm: LLMProvider,
        embedder: SupportsEmbedQuery,
        budget: ApiBudget | None = None,
        linker: EntityLinker | None = None,
        rerank_enabled: bool | None = None,
        intent_timeout: float | None = None,
    ) -> None:
        self.db = db
        self.llm = llm
        self.embedder = embedder
        self.budget = budget
        self.linker = linker
        self.rerank_enabled = (
            settings.rerank_enabled if rerank_enabled is None else rerank_enabled
        )
        # Seconds to wait for the intent model; 0 waits as long as it takes
        if intent_timeout is None:
            intent_timeout = settings.intent_timeout_seconds
        self.intent_timeout = intent_timeout
        # How the last retrieve() found its context: "vector+rerank", "vector",
        # "fulltext" or "none". Sent to clients and recorded by evals.
        self.last_mode = "none"
        self.reranked = False

    async def classify_intent(self, query: str) -> dict:
        """Stage 1: LLM-based intent classification and entity extraction.

        Returns dict with keys: intent, entities, metadata_filter. Falls back to
        an empty filter when the model fails, returns bad JSON or takes longer
        than `intent_timeout` seconds, so retrieval never waits long on this
        stage.
        """
        messages = [
            Message(role="system", content=INTENT_CLASSIFICATION_PROMPT),
            Message(role="user", content=query),
        ]
        try:
            raw = await asyncio.wait_for(
                self.llm.generate(
                    messages,
                    temperature=0.0,
                    max_tokens=1024,  # reasoning models think before writing the JSON
                    json_mode=True,
                ),
                timeout=self.intent_timeout or None,
            )
            # Strip markdown code fences if present
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                cleaned = cleaned.rsplit("```", 1)[0]
            result = json.loads(cleaned)
            if not isinstance(result, dict):
                raise TypeError(f"expected a JSON object, got {type(result).__name__}")
            logger.info(
                "Intent: %s | Entities: %s | Filter: %s",
                result.get("intent"),
                result.get("entities"),
                result.get("metadata_filter"),
            )
            return result
        except TimeoutError:
            logger.warning(
                "Intent classification took over %.0f s, using empty filter",
                self.intent_timeout,
            )
            return _no_intent()
        except (LLMError, ValueError, KeyError, TypeError, IndexError) as exc:
            logger.warning(
                "Intent classification failed (%s), using empty filter",
                exc,
            )
            return _no_intent()

    async def vector_search(
        self,
        query: str,
        metadata_filter: dict,
        top_k: int = 20,
    ) -> list[RetrievedChunk]:
        """Stage 2: Embed query and search via pgvector cosine similarity."""
        embedding = await asyncio.to_thread(
            self.embedder.embed_query,
            query,
        )

        # Clean metadata filter — remove empty values
        clean_filter = {
            k: v for k, v in metadata_filter.items() if v is not None and v != ""
        }

        result = await asyncio.to_thread(
            lambda: self.db.rpc(
                "match_knowledge_chunks",
                {
                    "query_embedding": embedding,
                    "filter_metadata": clean_filter or {},
                    "match_count": top_k,
                },
            ).execute(),
        )

        chunks = []
        for row in result.data or []:
            chunks.append(
                RetrievedChunk(
                    content=row["content"],
                    metadata=row["metadata"] or {},
                    similarity=row["similarity"],
                    source=row["source"] or "",
                )
            )

        logger.info(
            "Vector search returned %d chunks (filter: %s)",
            len(chunks),
            clean_filter,
        )
        return chunks

    async def rerank(
        self,
        query: str,
        chunks: list[RetrievedChunk],
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        """Stage 3: Cross-encoder reranking via HuggingFace Inference API."""
        if not chunks:
            return []

        if len(chunks) <= top_k:
            return chunks

        if self.budget is not None and not await asyncio.to_thread(self.budget.consume):
            logger.warning("HuggingFace budget reached, skipping rerank")
            return chunks[:top_k]

        try:
            scores = await self._hf_rerank(query, chunks)
        except (httpx.HTTPError, KeyError, ValueError, TypeError, IndexError) as exc:
            logger.warning(
                "HuggingFace reranker unavailable (%s), skipping rerank",
                exc,
            )
            return chunks[:top_k]

        scored = list(zip(chunks, scores, strict=True))
        scored.sort(key=lambda x: x[1], reverse=True)

        reranked = [chunk for chunk, _score in scored[:top_k]]
        self.reranked = True
        logger.info(
            "Reranked %d → %d chunks (top score: %.3f)",
            len(chunks),
            len(reranked),
            scored[0][1] if scored else 0,
        )
        return reranked

    async def _hf_rerank(
        self,
        query: str,
        chunks: list[RetrievedChunk],
    ) -> list[float]:
        """Call HuggingFace Inference API for cross-encoder scoring."""
        token = settings.huggingface_api_token
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "inputs": [{"text": query, "text_pair": c.content} for c in chunks],
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _RERANKER_URL,
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()

        # Response: [[{"label": "LABEL_0", "score": float}, ...]]
        data = resp.json()
        results = data[0] if isinstance(data[0], list) else data
        if len(results) != len(chunks):
            raise ValueError(f"Unexpected reranker response length: {len(results)}")
        return [item["score"] for item in results]

    async def fulltext_search(
        self,
        query: str,
        top_k: int = 5,
        metadata_filter: dict | None = None,
    ) -> list[RetrievedChunk]:
        """Fallback search: Postgres full-text ranking, no embeddings needed.

        Used when the embedding service is out of budget or down, so chat
        still answers from the knowledge base instead of from nothing. The
        intent classifier's filter is applied first; unfiltered matches top
        up the list when the filter is too narrow.
        """
        clean_filter = {
            k: v
            for k, v in (metadata_filter or {}).items()
            if v is not None and v != ""
        }
        chunks = await self._fulltext_rpc(query, top_k, clean_filter)
        if clean_filter and len(chunks) < top_k:
            seen = {c.source + c.content[:50] for c in chunks}
            for chunk in await self._fulltext_rpc(query, top_k, {}):
                if chunk.source + chunk.content[:50] not in seen:
                    chunks.append(chunk)
                    seen.add(chunk.source + chunk.content[:50])
            chunks = chunks[:top_k]
        logger.info("Full-text fallback returned %d chunks", len(chunks))
        return chunks

    async def _fulltext_rpc(
        self,
        query: str,
        top_k: int,
        metadata_filter: dict,
    ) -> list[RetrievedChunk]:
        try:
            result = await asyncio.to_thread(
                lambda: self.db.rpc(
                    "search_knowledge_text",
                    {
                        "query_text": query[:_FULLTEXT_MAX_CHARS],
                        "match_count": top_k,
                        "filter_metadata": metadata_filter,
                    },
                ).execute(),
            )
        except Exception:
            logger.exception("Full-text fallback search failed")
            return []

        return [
            RetrievedChunk(
                content=row["content"],
                metadata=row.get("metadata") or {},
                similarity=float(row.get("rank") or 0.0),
                source=row.get("source") or "",
            )
            for row in result.data or []
        ]

    async def _race_page_chunks(self, race: RaceRef) -> list[RetrievedChunk]:
        """The race's own page, read by its metadata (one chunk, its first).

        Uses no embeddings and needs no word of the question. If the read
        fails, only the race's slot is lost.
        """
        try:
            result = await asyncio.to_thread(
                lambda: self.db.table("knowledge_chunks")
                .select("content, metadata, source")
                .contains("metadata", _race_filter(race))
                .order("id")
                .limit(1)
                .execute(),
            )
        except Exception:
            logger.warning(
                "Race page read failed (%s); continuing without it",
                _race_ref(race),
                exc_info=True,
            )
            return []
        return [
            RetrievedChunk(
                content=row["content"],
                metadata=row.get("metadata") or {},
                similarity=0.0,
                source=row.get("source") or "",
            )
            for row in result.data or []
        ]

    async def retrieve(
        self, query: str, race: RaceRef | None = None
    ) -> list[RetrievedChunk]:
        """Full 3-stage pipeline: classify → search → rerank.

        Sets ``last_mode`` to how the context was found. Without embeddings
        the pipeline drops to full-text search instead of failing. A ``race``
        (the race page the question came from) gets its own page one
        guaranteed slot, as a named entity does; without one, every search
        is as before.
        """
        self.last_mode = "none"
        self.reranked = False

        # Stage 1: Intent classification
        intent_result = await self.classify_intent(query)
        if self.linker is not None:
            # Repair refs and drop filters the eval showed to hurt
            intent_result = self.linker.link(intent_result, query)
        # Without a linker these come straight from the model: check shapes
        metadata_filter = intent_result.get("metadata_filter")
        if not isinstance(metadata_filter, dict):
            metadata_filter = {}
        entities = intent_result.get("entities")
        if not isinstance(entities, dict):
            entities = {}
        # Set only by the linker, never read from the model's own JSON
        profile = (
            intent_result.get("circuit_profile") if self.linker is not None else None
        )

        # Stage 2: Primary vector search
        try:
            primary = await self.vector_search(
                query,
                metadata_filter,
                top_k=20,
            )
        except EmbeddingUnavailable as exc:
            logger.warning("Embeddings unavailable (%s), using full-text search", exc)
            chunks = await self.fulltext_search(
                query,
                top_k=5,
                metadata_filter=metadata_filter,
            )
            if race is not None:
                race_hits = await self._fulltext_rpc(query, 5, _race_filter(race))
                if not race_hits:
                    # Full text needs a word of the question in the page; with
                    # none ("Who triumphed?"), read the page's first chunk
                    race_hits = await self._race_page_chunks(race)
                chunks = self._ensure_entity_coverage(
                    chunks, {(_RACE_KEY, _race_ref(race)): race_hits}, top_k=5
                )
            self.last_mode = "fulltext" if chunks else "none"
            return chunks

        candidates: list[RetrievedChunk] = []
        seen: set[str] = set()

        def add(chunks: list[RetrievedChunk]) -> None:
            for chunk in chunks:
                key = chunk.source + chunk.content[:50]
                if key not in seen:
                    candidates.append(chunk)
                    seen.add(key)

        add(primary)

        # Stage 2b: Too few filtered results? Relax the filter one step at a
        # time. Season-only comes first: a race named for one country but held
        # in another ("Bahrain Grand Prix" at Sepang in 2026) fails the circuit
        # filter but is still a race of that season. This counts the filtered
        # search alone, before entity searches pad the list.
        if len(primary) < 5 and metadata_filter:
            fallbacks: list[dict] = []
            if "season" in metadata_filter and len(metadata_filter) > 1:
                fallbacks.append({"season": metadata_filter["season"]})
            fallbacks.append({})
            for fallback in fallbacks:
                logger.info(
                    "Too few filtered results (%d), relaxing filter to %s",
                    len(candidates),
                    fallback or "none",
                )
                add(await self._safe_search(query, fallback, top_k=20))
                if len(candidates) >= 5:
                    break
            del candidates[20:]

        # Stage 2c: A targeted search per named entity. Its hits rank after
        # the main results; coverage below gives each entity a slot.
        entity_hits = await self._entity_searches(query, entities)
        if isinstance(profile, str) and profile:
            # A year read from the question narrowed the filter to that
            # season's race, which also covers the circuit; the circuit's
            # profile keeps a slot of its own (#44)
            profile_hits = await self._safe_search(
                query, {"circuit_ref": profile, "category": "circuits"}, top_k=5
            )
            entity_hits = {(_PROFILE_KEY, profile): profile_hits, **entity_hits}
        if race is not None:
            # The race page's race claims its slot first
            race_hits = await self._safe_search(query, _race_filter(race), top_k=5)
            entity_hits = {(_RACE_KEY, _race_ref(race)): race_hits, **entity_hits}
        for chunks in entity_hits.values():
            add(chunks)

        # Stage 3: Rerank
        if self.rerank_enabled:
            reranked = await self.rerank(query, candidates, top_k=5)
        else:
            reranked = candidates[:5]

        # Stage 3b: Guarantee each named entity a place in the final list
        if entity_hits:
            reranked = self._ensure_entity_coverage(reranked, entity_hits, top_k=5)

        if reranked:
            self.last_mode = "vector+rerank" if self.reranked else "vector"
        return reranked

    async def _safe_search(
        self,
        query: str,
        metadata_filter: dict,
        top_k: int,
    ) -> list[RetrievedChunk]:
        """A secondary search: if it fails, only its own results are lost."""
        try:
            return await self.vector_search(query, metadata_filter, top_k=top_k)
        except Exception:
            logger.warning(
                "Secondary search failed (filter %s); continuing without it",
                metadata_filter,
                exc_info=True,
            )
            return []

    async def _entity_searches(
        self,
        query: str,
        entities: dict,
    ) -> dict[tuple[str, str], list[RetrievedChunk]]:
        """Run a targeted search per named driver, team and circuit.

        Returns hits keyed by (metadata key, ref), in the order the entities
        were named. An entity whose search failed or found nothing maps to an
        empty list, so coverage still protects the chunks that mention it.
        """
        hits: dict[tuple[str, str], list[RetrievedChunk]] = {}
        for kind, key, extra in _ENTITY_SEARCHES:
            names = entities.get(kind)
            for name in names if isinstance(names, list) else []:
                ref = str(name).lower().replace(" ", "_")
                if (key, ref) not in hits:
                    hits[(key, ref)] = await self._safe_search(
                        query, {key: ref, **extra}, top_k=5
                    )
        found = [ref for (_key, ref), chunks in hits.items() if chunks]
        if found:
            logger.info("Entity searches covered: %s", ", ".join(found))
        return hits

    @staticmethod
    def _covers(chunk: RetrievedChunk, key: str, ref: str) -> bool:
        """Whether ``chunk`` comes from one of the entity's own documents.

        Exact metadata matches only. A driver profile carries its team's
        constructor_ref but isn't the team's document, so it can't stand in
        for the team.
        """
        meta = chunk.metadata
        if key == _PROFILE_KEY:
            return meta.get("category") == "circuits" and meta.get("circuit_ref") == ref
        if key == _RACE_KEY:
            return (
                meta.get("category") == "race"
                and f"{meta.get('season')}-r{meta.get('round')}" == ref
            )
        if meta.get(key) != ref:
            return False
        return key != "constructor_ref" or not meta.get("driver_ref")

    def _ensure_entity_coverage(
        self,
        ranked: list[RetrievedChunk],
        entity_hits: dict[tuple[str, str], list[RetrievedChunk]],
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        """Make sure every named entity has at least one chunk in the result.

        A missing entity gets its best targeted hit. It takes the place of the
        lowest-ranked chunk that no other entity depends on: an entity's only
        chunk is kept (so a comparison keeps both sides), but a third chunk
        about one race can make room for a second race.
        """
        result = list(ranked[:top_k])
        for key, ref in entity_hits:
            if any(self._covers(c, key, ref) for c in result):
                continue
            best = next(
                (c for c in entity_hits[(key, ref)] if self._covers(c, key, ref)), None
            )
            if best is None:
                continue
            if len(result) >= top_k:
                victim = self._eviction_victim(result, entity_hits)
                if victim is None:
                    continue
                result.pop(victim)
            result.append(best)
            logger.info("Injected entity chunk for '%s'", ref)
        return result

    def _eviction_victim(
        self,
        result: list[RetrievedChunk],
        entity_hits: dict[tuple[str, str], list[RetrievedChunk]],
    ) -> int | None:
        """Index of the lowest-ranked chunk no entity depends on, if any."""
        for i in range(len(result) - 1, -1, -1):
            others = result[:i] + result[i + 1 :]
            if all(
                any(self._covers(c, key, ref) for c in others)
                for key, ref in entity_hits
                if self._covers(result[i], key, ref)
            ):
                return i
        return None
