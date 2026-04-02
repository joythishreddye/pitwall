-- Vector similarity search RPC for RAG retrieval
-- Called from Python: supabase.rpc("match_knowledge_chunks", {...})

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding extensions.vector(768),
  filter_metadata jsonb DEFAULT '{}'::jsonb,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id int,
  content text,
  metadata jsonb,
  similarity float,
  source text,
  token_count int
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.metadata,
    (1 - (kc.embedding <=> query_embedding))::float AS similarity,
    kc.source,
    kc.token_count
  FROM knowledge_chunks kc
  WHERE CASE
    WHEN filter_metadata = '{}'::jsonb THEN TRUE
    ELSE kc.metadata @> filter_metadata
  END
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
