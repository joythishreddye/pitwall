"""Three-stage RAG retrieval: intent classification → vector search → reranking."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Protocol

import httpx
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


class SupportsEmbedQuery(Protocol):
    """Any embedder that can embed a query string."""

    def embed_query(self, query: str) -> list[float]: ...


@dataclass
class RetrievedChunk:
    content: str
    metadata: dict
    similarity: float
    source: str


class Retriever:
    """Three-stage RAG retrieval pipeline."""

    def __init__(
        self,
        db: Client,
        llm: LLMProvider,
        embedder: SupportsEmbedQuery,
        budget: ApiBudget | None = None,
        linker: EntityLinker | None = None,
        rerank_enabled: bool = True,
    ) -> None:
        self.db = db
        self.llm = llm
        self.embedder = embedder
        self.budget = budget
        self.linker = linker
        self.rerank_enabled = rerank_enabled
        # How the last retrieve() found its context: "vector+rerank", "vector",
        # "fulltext" or "none". Sent to clients and recorded by evals.
        self.last_mode = "none"
        self.reranked = False

    async def classify_intent(self, query: str) -> dict:
        """Stage 1: LLM-based intent classification and entity extraction.

        Returns dict with keys: intent, entities, metadata_filter. Falls back to
        an empty filter when the model fails or returns bad JSON, so retrieval
        never blocks on this stage.
        """
        messages = [
            Message(role="system", content=INTENT_CLASSIFICATION_PROMPT),
            Message(role="user", content=query),
        ]
        try:
            raw = await self.llm.generate(
                messages,
                temperature=0.0,
                max_tokens=1024,  # reasoning models think before writing the JSON
                json_mode=True,
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
        except (LLMError, ValueError, KeyError, TypeError, IndexError) as exc:
            logger.warning(
                "Intent classification failed (%s), using empty filter",
                exc,
            )
            return {
                "intent": "unknown",
                "entities": {
                    "drivers": [],
                    "teams": [],
                    "circuits": [],
                    "seasons": [],
                },
                "metadata_filter": {},
            }

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

    async def retrieve(self, query: str) -> list[RetrievedChunk]:
        """Full 3-stage pipeline: classify → search → rerank.

        Sets ``last_mode`` to how the context was found. Without embeddings
        the pipeline drops to full-text search instead of failing.
        """
        self.last_mode = "none"
        self.reranked = False

        # Stage 1: Intent classification
        intent_result = await self.classify_intent(query)
        if self.linker is not None:
            # Repair refs and drop filters the eval showed to hurt
            intent_result = self.linker.link(intent_result, query)
        metadata_filter = intent_result.get("metadata_filter", {})
        entities = intent_result.get("entities", {})

        # Stage 2: Primary vector search
        try:
            candidates = await self.vector_search(
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
            self.last_mode = "fulltext" if chunks else "none"
            return chunks

        # Stage 2b: Entity-aware supplementary searches
        entity_chunks = await self._entity_searches(
            query,
            entities,
            candidates,
        )
        if entity_chunks:
            seen = {c.source + c.content[:50] for c in candidates}
            for chunk in entity_chunks:
                if chunk.source + chunk.content[:50] not in seen:
                    candidates.append(chunk)
                    seen.add(chunk.source + chunk.content[:50])

        # Stage 2c: If still too few, retry unfiltered
        if len(candidates) < 5 and metadata_filter:
            logger.info(
                "Too few filtered results (%d), retrying unfiltered",
                len(candidates),
            )
            unfiltered = await self.vector_search(query, {}, top_k=20)
            seen = {c.source + c.content[:50] for c in candidates}
            for chunk in unfiltered:
                if chunk.source + chunk.content[:50] not in seen:
                    candidates.append(chunk)
                    if len(candidates) >= 20:
                        break

        # Stage 3: Rerank
        if self.rerank_enabled:
            reranked = await self.rerank(query, candidates, top_k=5)
        else:
            reranked = candidates[:5]

        # Stage 3b: Guarantee entity representation
        # If specific entities were identified, ensure at least
        # the top chunk from each entity search makes the final list
        if entity_chunks:
            reranked = self._ensure_entity_coverage(
                reranked,
                entity_chunks,
                entities,
                top_k=5,
            )

        if reranked:
            self.last_mode = "vector+rerank" if self.reranked else "vector"
        return reranked

    async def _entity_searches(
        self,
        query: str,
        entities: dict,
        existing: list[RetrievedChunk],
    ) -> list[RetrievedChunk]:
        """Run targeted searches for specific entities mentioned in query."""
        extra: list[RetrievedChunk] = []

        # Search for each driver's profile
        for driver_ref in entities.get("drivers", []):
            ref = driver_ref.lower().replace(" ", "_")
            chunks = await self.vector_search(
                query,
                {"driver_ref": ref},
                top_k=5,
            )
            extra.extend(chunks)

        # Search for each team's profile
        for team_ref in entities.get("teams", []):
            ref = team_ref.lower().replace(" ", "_")
            chunks = await self.vector_search(
                query,
                {"constructor_ref": ref},
                top_k=5,
            )
            extra.extend(chunks)

        if extra:
            logger.info(
                "Entity searches added %d supplementary chunks",
                len(extra),
            )
        return extra

    def _ensure_entity_coverage(
        self,
        reranked: list[RetrievedChunk],
        entity_chunks: list[RetrievedChunk],
        entities: dict,
        top_k: int = 5,
    ) -> list[RetrievedChunk]:
        """Ensure reranked results include at least one chunk per entity.

        For queries about specific drivers/teams, the cross-encoder
        may rank generic results above entity profiles. This injects
        the top entity chunk if it's missing from the final results.
        """
        injected = list(reranked)

        # Group entity chunks by their entity ref
        entity_best: dict[str, RetrievedChunk] = {}
        for chunk in entity_chunks:
            meta = chunk.metadata
            ref = meta.get("driver_ref") or meta.get("constructor_ref")
            if ref and ref not in entity_best:
                entity_best[ref] = chunk

        # Entities in the order the question named them (stable across runs)
        all_refs: list[str] = []
        for name in [*entities.get("drivers", []), *entities.get("teams", [])]:
            ref = name.lower().replace(" ", "_")
            if ref not in all_refs:
                all_refs.append(ref)

        protected: set[int] = set()  # chunks injected here; never evicted
        for ref in all_refs:
            # Check if any result already covers this entity
            has_coverage = any(
                ref in c.source
                or ref == c.metadata.get("driver_ref")
                or ref == c.metadata.get("constructor_ref")
                for c in injected
            )
            if has_coverage or ref not in entity_best:
                continue
            if len(injected) >= top_k:
                # Evict the lowest-ranked chunk we didn't inject ourselves.
                # (Popping the last one used to drop the previous entity in a
                # comparison, so only one side ever reached the prompt.)
                victim = next(
                    (
                        i
                        for i in range(len(injected) - 1, -1, -1)
                        if id(injected[i]) not in protected
                    ),
                    None,
                )
                if victim is None:
                    continue
                injected.pop(victim)
            injected.append(entity_best[ref])
            protected.add(id(entity_best[ref]))
            logger.info("Injected entity chunk for '%s'", ref)

        return injected[:top_k]
