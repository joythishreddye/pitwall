"""Measure retrieval quality against the hand-written gold set.

Usage (from backend/):
    python scripts/eval_rag.py                    # local embeddings + local reranker
    python scripts/eval_rag.py --reranker none    # skip the cross-encoder
    python scripts/eval_rag.py --embedder hf      # production HF path (uses budget)
    python scripts/eval_rag.py --limit 10         # quick smoke run

Each question runs through these retrieval modes (top 5 chunks each):

    fulltext          Postgres full-text search, no filter
    fulltext+intent   full text with the intent filter (production without embeddings)
    vector            pgvector search, no filter
    vector+intent     intent filter + entity searches, no rerank (production)
    vector+scan       vector+intent with the intent model down: the linker
                      builds the filter from the question's names alone
                      (with --no-linker: no filter, but a question's race
                      still gets its own search and slot)
    full              vector+intent, then cross-encoder rerank

A question with a "race" (asked from a race page: season and round) passes it
to the modes that run the whole pipeline (vector+intent, vector+scan and full,
raw or not), as the chat does. The other modes search the question alone.

Metrics:
    hit@5     any expected doc appears in the top 5
    recall@5  share of expected docs that appear (matters for comparisons)
    MRR@5     1 / rank of the first expected doc (0 if absent)

Local embeddings use the same BGE-base-en-v1.5 model and query prefix as the
HuggingFace path, so vector modes match production without spending budget.
Intent extraction calls the configured intent model on Groq once per question.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from intent_cache import IntentCache, PatientLLM

from app.config import settings
from app.db.supabase import get_supabase
from app.llm.base import LLMError
from app.llm.factory import create_llm
from app.rag.entities import EntityLinker
from app.rag.prompt import INTENT_CLASSIFICATION_PROMPT
from app.rag.retriever import RaceRef, RetrievedChunk, Retriever

ROOT = Path(__file__).resolve().parents[1]
GOLD_PATH = ROOT / "evals" / "rag_gold.json"
RESULTS_DIR = ROOT / "evals" / "results"
MODELS_DIR = ROOT / "models"
# "(raw)" modes use the classifier's filters as-is; the others go through the
# entity linker. Both come from the same classifier output, so the difference
# between them is the linker's effect alone.
MODES = (
    "fulltext",
    "fulltext+intent(raw)",
    "fulltext+intent",
    "vector",
    "vector+intent(raw)",
    "vector+intent",
    "vector+scan",
    "full",
)
TOP_K = 5
# Groq allows 30 requests/min per model; one intent call per question
_SECONDS_BETWEEN_INTENT_CALLS = 2.1

logger = logging.getLogger("eval_rag")
_OUTAGE = "intent model down (eval_rag vector+scan)"


@dataclass
class ModeResult:
    sources: list[str]
    seconds: float
    hit: bool = False
    recall: float = 0.0
    reciprocal_rank: float = 0.0


@dataclass
class QuestionResult:
    id: str
    kind: str
    question: str
    expected: list[str]
    intent: dict
    raw_filter: dict = field(default_factory=dict)
    scan_filter: dict = field(default_factory=dict)
    modes: dict[str, ModeResult] = field(default_factory=dict)


class DownLLM:
    """The intent model in an outage: every call fails as Groq's would."""

    model = "down"

    async def generate(self, *_args, **_kwargs) -> str:
        raise LLMError(_OUTAGE)


class _HideOutageWarnings(logging.Filter):
    """vector+scan fails the model on purpose: one warning per question is noise."""

    def filter(self, record: logging.LogRecord) -> bool:
        return _OUTAGE not in record.getMessage()


def score(sources: list[str], expected: list[str]) -> tuple[bool, float, float]:
    """hit@k, recall@k and reciprocal rank for one ranked list of sources."""
    top = sources[:TOP_K]
    found = {s for s in top if s in expected}
    rank = next((i for i, s in enumerate(top, start=1) if s in expected), None)
    return bool(found), len(found) / len(expected), (1 / rank if rank else 0.0)


class LocalEmbedder:
    """Production-equivalent query embeddings computed on this machine."""

    def __init__(self) -> None:
        from app.rag.embedder import Embedder

        self._embedder = Embedder.get()

    def embed_query(self, query: str) -> list[float]:
        return self._embedder.embed_query(query)


def make_local_reranker():
    """bge-reranker-base on CPU, matching the hosted reranker's model."""
    from sentence_transformers import CrossEncoder

    # On the Mac's GPU (sentence-transformers' default there) the reranker ran
    # out of memory at question 43 of 63, twice
    model = CrossEncoder(
        "BAAI/bge-reranker-base", cache_folder=str(MODELS_DIR), device="cpu"
    )

    async def rerank(query: str, chunks: list[RetrievedChunk]) -> list[float]:
        pairs = [(query, c.content) for c in chunks]
        scores = await asyncio.to_thread(model.predict, pairs)
        return [float(s) for s in scores]

    return rerank


async def run_question(
    item: dict,
    db,
    intent_llm,
    embedder,
    reranker,
    linker: EntityLinker | None,
    cache: IntentCache | None = None,
) -> QuestionResult:
    question = item["question"]
    race = RaceRef(**item["race"]) if item.get("race") else None
    # No time limit: the eval waits out Groq's rate limits (PatientLLM), where
    # production would go on without the intent model
    base = Retriever(db=db, llm=intent_llm, embedder=embedder, intent_timeout=0)
    intent = cache.get(question) if cache else None
    if intent is None:
        intent = await base.classify_intent(question)
        if cache:
            cache.record(question, intent, getattr(intent_llm, "failed", False))
    linked = linker.link(intent, question) if linker else intent
    down = Retriever(
        db=db,
        llm=DownLLM(),
        embedder=embedder,
        linker=linker,
        rerank_enabled=False,
    )
    # The retriever's own fallback when the model fails, linked as it would be
    outage = await down.classify_intent(question)
    scanned = linker.link(outage, question) if linker else outage
    result = QuestionResult(
        id=item["id"],
        kind=item["kind"],
        question=question,
        expected=item["expected"],
        intent=linked,
        raw_filter=intent.get("metadata_filter", {}) or {},
        scan_filter=scanned.get("metadata_filter", {}) or {},
    )
    intent_filter = linked.get("metadata_filter", {}) or {}

    async def cached_intent(_query: str) -> dict:
        return intent

    async def timed(coro) -> tuple[list[RetrievedChunk], float]:
        start = time.perf_counter()
        chunks = await coro
        return chunks, time.perf_counter() - start

    async def no_rerank(query, chunks, top_k=TOP_K):
        return chunks[:top_k]

    def pipeline(rerank: bool, use_linker: bool = True) -> Retriever:
        r = Retriever(
            db=db,
            llm=intent_llm,
            embedder=embedder,
            linker=linker if use_linker else None,
        )
        r.classify_intent = cached_intent  # type: ignore[method-assign]
        if rerank and reranker is not None:
            r._hf_rerank = reranker  # type: ignore[method-assign]
            r.rerank_enabled = True  # settings default it off in production
        else:
            # Never fall through to the hosted reranker by accident
            r.rerank = no_rerank  # type: ignore[method-assign]
        return r

    runs = {
        "fulltext": base.fulltext_search(question, TOP_K, {}),
        "fulltext+intent(raw)": base.fulltext_search(
            question, TOP_K, result.raw_filter
        ),
        "fulltext+intent": base.fulltext_search(question, TOP_K, intent_filter),
        "vector": base.vector_search(question, {}, top_k=TOP_K),
        "vector+intent(raw)": pipeline(rerank=False, use_linker=False).retrieve(
            question, race=race
        ),
        "vector+intent": pipeline(rerank=False).retrieve(question, race=race),
        "vector+scan": down.retrieve(question, race=race),
        "full": pipeline(rerank=True).retrieve(question, race=race),
    }
    for mode, coro in runs.items():
        chunks, seconds = await timed(coro)
        sources = [c.source for c in chunks]
        hit, recall, rr = score(sources, item["expected"])
        result.modes[mode] = ModeResult(sources, seconds, hit, recall, rr)
    return result


def summarize(results: list[QuestionResult]) -> dict[str, dict[str, float]]:
    summary = {}
    for mode in MODES:
        rows = [r.modes[mode] for r in results]
        summary[mode] = {
            "hit@5": statistics.mean(m.hit for m in rows),
            "recall@5": statistics.mean(m.recall for m in rows),
            "mrr@5": statistics.mean(m.reciprocal_rank for m in rows),
            "p50_seconds": statistics.median(m.seconds for m in rows),
        }
    return summary


def print_table(summary: dict, results: list[QuestionResult]) -> None:
    print(f"\n{len(results)} questions, top {TOP_K}\n")
    print(f"{'mode':<17}{'hit@5':>8}{'recall@5':>10}{'MRR@5':>8}{'p50 s':>8}")
    for mode, m in summary.items():
        print(
            f"{mode:<17}{m['hit@5']:>8.1%}{m['recall@5']:>10.1%}"
            f"{m['mrr@5']:>8.3f}{m['p50_seconds']:>8.2f}"
        )
    misses = [r for r in results if not r.modes["full"].hit]
    if misses:
        print("\nMissed by the full pipeline:")
        for r in misses:
            print(f"  {r.id}: {r.question}  -> {r.modes['full'].sources[:3]}")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--embedder", choices=["local", "hf"], default="local")
    parser.add_argument("--reranker", choices=["local", "hf", "none"], default="local")
    parser.add_argument(
        "--limit", type=int, default=0, help="Only the first N questions"
    )
    parser.add_argument(
        "--intent-cache",
        type=Path,
        help="Replay the intent model's answers recorded in this JSON file, "
        "recording new ones (a rate limit is waited out, not failed)",
    )
    parser.add_argument(
        "--no-linker",
        action="store_true",
        help="Use the classifier's raw filters (reproduces the first baseline)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s"
    )
    logging.getLogger("app.rag.retriever").addFilter(_HideOutageWarnings())

    gold = json.loads(GOLD_PATH.read_text())["questions"]
    if args.limit:
        gold = gold[: args.limit]

    db = get_supabase()
    intent_llm = create_llm(settings.llm_intent_model)
    cache = None
    if args.intent_cache:
        cache = IntentCache(
            args.intent_cache, settings.llm_intent_model, INTENT_CLASSIFICATION_PROMPT
        )
        intent_llm = PatientLLM(intent_llm)
    if args.embedder == "local":
        embedder = LocalEmbedder()
    else:
        from app.rag.budget import ApiBudget
        from app.rag.query_embedder import QueryEmbedder

        embedder = QueryEmbedder(budget=ApiBudget(db, settings.hf_monthly_call_limit))

    linker = None if args.no_linker else EntityLinker.from_db(db)

    reranker = None
    if args.reranker == "local":
        reranker = make_local_reranker()
    elif args.reranker == "hf":
        # Hosted reranker: spend goes through the same monthly ceiling as prod
        from app.rag.budget import ApiBudget

        budget = ApiBudget(db, settings.hf_monthly_call_limit)
        hf_rerank = Retriever(db=db, llm=intent_llm, embedder=embedder)._hf_rerank

        async def reranker(query, chunks):
            if not await asyncio.to_thread(budget.consume):
                raise ValueError("HuggingFace budget reached")
            return await hf_rerank(query, chunks)

    results: list[QuestionResult] = []
    for i, item in enumerate(gold, start=1):
        replayed = cache is not None and cache.has(item["question"])
        if i > 1 and not replayed:
            await asyncio.sleep(_SECONDS_BETWEEN_INTENT_CALLS)
        result = await run_question(
            item, db, intent_llm, embedder, reranker, linker, cache
        )
        results.append(result)
        verdict = "hit" if result.modes["full"].hit else "MISS"
        print(f"[{i:>2}/{len(gold)}] {item['id']:<8} full={verdict}", flush=True)

    summary = summarize(results)
    print_table(summary, results)
    if cache:
        print("\n" + "\n".join(cache.summary_lines()))

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H%MZ")
    tag = "raw" if args.no_linker else "linked"
    out = RESULTS_DIR / f"{stamp}-{args.embedder}-{args.reranker}-{tag}.json"
    out.write_text(
        json.dumps(
            {
                "run_at": stamp,
                "embedder": args.embedder,
                "reranker": args.reranker,
                "intent_model": settings.llm_intent_model,
                "linker": not args.no_linker,
                "intent_cache": (
                    {
                        "file": args.intent_cache.name,
                        "replayed": cache.hits,
                        "asked": cache.misses,
                        # Asked but not recorded: production mode scored the
                        # stand-in for these
                        "failed": cache.failed,
                    }
                    if cache
                    else None
                ),
                "gold_version": json.loads(GOLD_PATH.read_text())["version"],
                "summary": summary,
                "questions": [
                    {
                        "id": r.id,
                        "kind": r.kind,
                        "question": r.question,
                        "expected": r.expected,
                        "raw_filter": r.raw_filter,
                        "intent_filter": r.intent.get("metadata_filter", {}),
                        "scan_filter": r.scan_filter,
                        "modes": {
                            mode: {
                                "sources": m.sources,
                                "hit": m.hit,
                                "recall": m.recall,
                                "rr": m.reciprocal_rank,
                                "seconds": round(m.seconds, 3),
                            }
                            for mode, m in r.modes.items()
                        },
                    }
                    for r in results
                ],
            },
            indent=2,
        )
    )
    print(f"\nSaved {out.relative_to(ROOT)}")


if __name__ == "__main__":
    asyncio.run(main())
