"""CLI script to generate knowledge docs and ingest into Supabase pgvector.

Usage:
    cd backend && python scripts/ingest_knowledge.py              # generate + ingest
    cd backend && python scripts/ingest_knowledge.py --ingest-only  # skip generation
"""

import argparse
import logging
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from app.db.supabase import get_supabase
from app.ingestion.generate_knowledge import generate_all
from app.ingestion.rag_ingest import run_rag_ingest

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--ingest-only",
        action="store_true",
        help="Skip doc generation, only run embedding + ingestion",
    )
    args = parser.parse_args()

    supabase = get_supabase()

    if not args.ingest_only:
        print("=== Phase 1: Generating knowledge docs from database ===")
        counts = generate_all(supabase)
        print(
            f"Generated: {counts['drivers']} drivers,"
            f" {counts['teams']} teams,"
            f" {counts['races']} races"
        )

    print("\n=== Phase 2: Chunking, embedding, and ingesting ===")
    total = run_rag_ingest(supabase)
    print(f"\nDone — {total} chunks ingested into knowledge_chunks table.")


if __name__ == "__main__":
    main()
