"""Knowledge base ingestion: chunk Markdown files, embed, and upsert to Supabase."""

import logging
import time
from pathlib import Path

from supabase import Client

from app.db.supabase import fetch_all
from app.rag.chunker import chunk_markdown
from app.rag.embedder import Embedder

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"
EMBED_BATCH_SIZE = 32
# Each insert also updates the vector and full-text indexes; 500-row batches
# hit Supabase's statement timeout.
INSERT_BATCH_SIZE = 100
INSERT_ATTEMPTS = 3
DELETE_SLICE = 200


def run_rag_ingest(supabase: Client) -> int:
    """Chunk all knowledge Markdown files, embed, and upsert to knowledge_chunks.

    Returns total number of chunks upserted.
    """
    embedder = Embedder.get()

    # Collect all Markdown files
    md_files = sorted(KNOWLEDGE_DIR.rglob("*.md"))
    if not md_files:
        logger.warning("No Markdown files found in %s", KNOWLEDGE_DIR)
        return 0

    logger.info("Found %d Markdown files in %s", len(md_files), KNOWLEDGE_DIR)

    # Chunk all files
    all_chunks: list[dict] = []
    for filepath in md_files:
        chunks = chunk_markdown(filepath)
        all_chunks.extend(chunks)
        logger.info("  %s → %d chunks", filepath.name, len(chunks))

    if not all_chunks:
        logger.warning("No chunks produced from any file")
        return 0

    logger.info("Total chunks to embed: %d", len(all_chunks))

    # Embed in batches
    texts = [c["content"] for c in all_chunks]
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i : i + EMBED_BATCH_SIZE]
        embeddings = embedder.embed_documents(batch)
        all_embeddings.extend(embeddings)
        logger.info(
            "  Embedded batch %d/%d",
            i // EMBED_BATCH_SIZE + 1,
            (len(texts) + EMBED_BATCH_SIZE - 1) // EMBED_BATCH_SIZE,
        )

    # Build rows for upsert
    rows = []
    for chunk, embedding in zip(all_chunks, all_embeddings, strict=True):
        rows.append(
            {
                "content": chunk["content"],
                "metadata": chunk["metadata"],
                "embedding": embedding,
                "token_count": chunk["token_count"],
                "source": chunk["source"],
            }
        )

    # Swap, don't wipe: write the new set first, then delete the old one.
    # (Deleting first left the knowledge base half-empty when an insert batch
    # hit the statement timeout.) A failure part way through removes the
    # partial new rows and leaves the previous set serving.
    latest = (
        supabase.table("knowledge_chunks")
        .select("id")
        .order("id", desc=True)
        .limit(1)
        .execute()
        .data
    )
    old_max_id = latest[0]["id"] if latest else 0

    total = 0
    try:
        for i in range(0, len(rows), INSERT_BATCH_SIZE):
            batch = rows[i : i + INSERT_BATCH_SIZE]
            _insert_with_retry(supabase, batch)
            total += len(batch)
    except Exception:
        logger.exception("Insert failed after %d rows; rolling back new rows", total)
        _delete_id_range(supabase, low=old_max_id, high=None)
        raise

    logger.info("Inserted %d knowledge chunks; removing the previous set", total)
    _delete_id_range(supabase, low=None, high=old_max_id)
    return total


def _insert_with_retry(supabase: Client, batch: list[dict]) -> None:
    for attempt in range(1, INSERT_ATTEMPTS + 1):
        try:
            supabase.table("knowledge_chunks").insert(batch).execute()
            return
        except Exception:
            if attempt == INSERT_ATTEMPTS:
                raise
            wait = 2**attempt
            logger.warning(
                "Insert batch failed (attempt %d); retrying in %ds", attempt, wait
            )
            time.sleep(wait)


def _delete_id_range(supabase: Client, *, low: int | None, high: int | None) -> None:
    """Delete chunks with low < id <= high, in slices small enough to stay
    under the statement timeout. ``None`` leaves that side open."""
    ids = [
        row["id"]
        for row in fetch_all(
            lambda: supabase.table("knowledge_chunks").select("id").order("id")
        )
        if (low is None or row["id"] > low) and (high is None or row["id"] <= high)
    ]
    for i in range(0, len(ids), DELETE_SLICE):
        supabase.table("knowledge_chunks").delete().in_(
            "id", ids[i : i + DELETE_SLICE]
        ).execute()
