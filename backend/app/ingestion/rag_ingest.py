"""Knowledge base ingestion: chunk Markdown files, embed, and upsert to Supabase."""

import logging
from pathlib import Path

from supabase import Client

from app.rag.chunker import chunk_markdown
from app.rag.embedder import Embedder

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = Path(__file__).resolve().parents[2] / "knowledge"
EMBED_BATCH_SIZE = 32
INSERT_BATCH_SIZE = 500


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
        rows.append({
            "content": chunk["content"],
            "metadata": chunk["metadata"],
            "embedding": embedding,
            "token_count": chunk["token_count"],
            "source": chunk["source"],
        })

    # Clear existing knowledge chunks and insert fresh
    logger.info("Clearing existing knowledge_chunks...")
    supabase.table("knowledge_chunks").delete().gte("id", 0).execute()

    total = 0
    for i in range(0, len(rows), INSERT_BATCH_SIZE):
        batch = rows[i : i + INSERT_BATCH_SIZE]
        supabase.table("knowledge_chunks").insert(batch).execute()
        total += len(batch)

    logger.info("Inserted %d knowledge chunks", total)
    return total
