-- Exact vector search: drop the approximate HNSW index on knowledge_chunks.
--
-- The knowledge base holds about 1,100 chunks, and an exact scan of that
-- costs about a millisecond. The HNSW graph, by contrast, degraded after the
-- swap ingests, which delete and re-insert every row. On 2026-11-01 the
-- index returned five unrelated documents for "Who won the 2024 Miami Grand
-- Prix?", while exact search ranked the 2024 Miami race first.
--
-- match_knowledge_chunks needs no change: without the index, Postgres
-- computes every distance and keeps the top rows.
--
-- Bring an approximate index back only when the table passes roughly 50k
-- chunks. If you do, rebuild it after each bulk load and raise
-- hnsw.ef_search.

DROP INDEX IF EXISTS idx_knowledge_chunks_embedding;
