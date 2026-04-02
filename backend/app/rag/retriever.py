"""Three-stage RAG retrieval: intent classification → vector search → reranking."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from dataclasses import dataclass

from supabase import Client

from app.llm.base import LLMProvider, Message
from app.rag.embedder import Embedder
from app.rag.prompt import INTENT_CLASSIFICATION_PROMPT

logger = logging.getLogger(__name__)

# Module-level reranker singleton (matches Embedder.get() pattern)
_reranker = None
_reranker_lock = threading.Lock()


def _get_reranker():
    """Return the cross-encoder singleton, loading on first call."""
    global _reranker
    if _reranker is None:
        with _reranker_lock:
            if _reranker is None:
                from sentence_transformers import CrossEncoder

                logger.info("Loading cross-encoder reranker")
                _reranker = CrossEncoder(
                    "cross-encoder/ms-marco-MiniLM-L-6-v2",
                    max_length=512,
                )
                logger.info("Cross-encoder loaded")
    return _reranker


@dataclass
class RetrievedChunk:
    content: str
    metadata: dict
    similarity: float
    source: str


class Retriever:
    """Three-stage RAG retrieval pipeline."""

    def __init__(
        self, db: Client, llm: LLMProvider, embedder: Embedder,
    ) -> None:
        self.db = db
        self.llm = llm
        self.embedder = embedder

    async def classify_intent(self, query: str) -> dict:
        """Stage 1: LLM-based intent classification and entity extraction.

        Returns dict with keys: intent, entities, metadata_filter.
        Falls back to empty filter on parse failure.
        """
        messages = [
            Message(role="system", content=INTENT_CLASSIFICATION_PROMPT),
            Message(role="user", content=query),
        ]
        try:
            raw = await self.llm.generate(
                messages, temperature=0.0, max_tokens=256,
            )
            # Strip markdown code fences if present
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                cleaned = cleaned.rsplit("```", 1)[0]
            result = json.loads(cleaned)
            logger.info(
                "Intent: %s | Entities: %s | Filter: %s",
                result.get("intent"),
                result.get("entities"),
                result.get("metadata_filter"),
            )
            return result
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            logger.warning(
                "Intent classification failed (%s), using empty filter", exc,
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
            self.embedder.embed_query, query,
        )

        # Clean metadata filter — remove empty values
        clean_filter = {
            k: v
            for k, v in metadata_filter.items()
            if v is not None and v != ""
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
            chunks.append(RetrievedChunk(
                content=row["content"],
                metadata=row["metadata"] or {},
                similarity=row["similarity"],
                source=row["source"] or "",
            ))

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
        """Stage 3: Cross-encoder reranking of candidate chunks."""
        if not chunks:
            return []

        if len(chunks) <= top_k:
            return chunks

        pairs = [(query, chunk.content) for chunk in chunks]
        scores = await asyncio.to_thread(_get_reranker().predict, pairs)

        scored = list(zip(chunks, scores, strict=True))
        scored.sort(key=lambda x: x[1], reverse=True)

        reranked = [chunk for chunk, _ in scored[:top_k]]
        logger.info(
            "Reranked %d → %d chunks (top score: %.3f)",
            len(chunks),
            len(reranked),
            scored[0][1] if scored else 0,
        )
        return reranked

    async def retrieve(self, query: str) -> list[RetrievedChunk]:
        """Full 3-stage pipeline: classify → search → rerank."""
        # Stage 1: Intent classification
        intent_result = await self.classify_intent(query)
        metadata_filter = intent_result.get("metadata_filter", {})
        entities = intent_result.get("entities", {})

        # Stage 2: Primary vector search
        candidates = await self.vector_search(
            query, metadata_filter, top_k=20,
        )

        # Stage 2b: Entity-aware supplementary searches
        entity_chunks = await self._entity_searches(
            query, entities, candidates,
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
        reranked = await self.rerank(query, candidates, top_k=5)

        # Stage 3b: Guarantee entity representation
        # If specific entities were identified, ensure at least
        # the top chunk from each entity search makes the final list
        if entity_chunks:
            reranked = self._ensure_entity_coverage(
                reranked, entity_chunks, entities, top_k=5,
            )

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
                query, {"driver_ref": ref}, top_k=5,
            )
            extra.extend(chunks)

        # Search for each team's profile
        for team_ref in entities.get("teams", []):
            ref = team_ref.lower().replace(" ", "_")
            chunks = await self.vector_search(
                query, {"constructor_ref": ref}, top_k=5,
            )
            extra.extend(chunks)

        if extra:
            logger.info(
                "Entity searches added %d supplementary chunks", len(extra),
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

        # Check which entities are missing from results
        all_refs = set()
        for driver in entities.get("drivers", []):
            all_refs.add(driver.lower().replace(" ", "_"))
        for team in entities.get("teams", []):
            all_refs.add(team.lower().replace(" ", "_"))

        for ref in all_refs:
            # Check if any result already covers this entity
            has_coverage = any(
                ref in c.source or ref == c.metadata.get("driver_ref")
                or ref == c.metadata.get("constructor_ref")
                for c in injected
            )
            if not has_coverage and ref in entity_best:
                # Replace the lowest-ranked result
                if len(injected) >= top_k:
                    injected.pop()
                injected.append(entity_best[ref])
                logger.info("Injected entity chunk for '%s'", ref)

        return injected[:top_k]
