-- Better full-text fallback ranking.
-- 005's OR query rewarded chunks that repeat a common word ("fast"), so
-- "Why is Mercedes so fast?" surfaced the DRS explainer over the Mercedes
-- profile. Rank by how many distinct question terms a chunk covers first,
-- then by frequency, and accept the intent classifier's metadata filter.
-- The old two-argument signature is dropped so PostgREST sees one function.

DROP FUNCTION IF EXISTS public.search_knowledge_text(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.search_knowledge_text(
    query_text      TEXT,
    match_count     INTEGER DEFAULT 5,
    filter_metadata JSONB   DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id       INT,
    content  TEXT,
    metadata JSONB,
    source   TEXT,
    rank     REAL
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH terms AS (
        -- Stemmed, stopword-free lexemes from the question
        SELECT DISTINCT lexeme
        FROM unnest(tsvector_to_array(to_tsvector('english', query_text))) AS lexeme
    ),
    q AS (
        -- Lexemes are already normalized, so cast instead of re-stemming
        SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery AS tsq
        FROM terms
        HAVING count(*) > 0
    ),
    scored AS (
        SELECT kc.id, kc.content, kc.metadata, kc.source,
               (SELECT count(*)
                  FROM terms t
                 WHERE to_tsvector('english', kc.content)
                       @@ quote_literal(t.lexeme)::tsquery) AS coverage,
               ts_rank(to_tsvector('english', kc.content), q.tsq, 1) AS freq
        FROM public.knowledge_chunks kc, q
        WHERE to_tsvector('english', kc.content) @@ q.tsq
          AND (filter_metadata = '{}'::jsonb OR kc.metadata @> filter_metadata)
    )
    SELECT id, content, metadata, source, (coverage + freq)::real AS rank
    FROM scored
    ORDER BY coverage DESC, freq DESC
    LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

REVOKE EXECUTE ON FUNCTION public.search_knowledge_text(TEXT, INTEGER, JSONB)
    FROM PUBLIC, anon, authenticated;
