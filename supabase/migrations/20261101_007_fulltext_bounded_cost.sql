-- Bound the cost of the full-text fallback.
-- 006 re-parsed one tsquery per query term per chunk, so a 2,000-character
-- message of common words took over a second of database time (5.7 s on a
-- replica). Now each chunk's tsvector is built once, coverage is an array
-- intersection, and the query is capped at 300 characters.
-- Same signature, so existing grants and revokes stay in place.

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
        -- Stemmed, stopword-free lexemes from the (capped) question
        SELECT array_agg(DISTINCT lexeme) AS lexemes
        FROM unnest(tsvector_to_array(to_tsvector('english', left(query_text, 300)))) AS lexeme
    ),
    q AS (
        -- Lexemes are already normalized, so cast instead of re-stemming
        SELECT lexemes,
               array_to_string(
                   ARRAY(SELECT quote_literal(l) FROM unnest(lexemes) AS l), ' | '
               )::tsquery AS tsq
        FROM terms
        WHERE lexemes IS NOT NULL
    ),
    scored AS (
        SELECT kc.id, kc.content, kc.metadata, kc.source,
               cardinality(ARRAY(
                   SELECT unnest(q.lexemes)
                   INTERSECT
                   SELECT unnest(tsvector_to_array(d.tsv))
               )) AS coverage,
               ts_rank(d.tsv, q.tsq, 1) AS freq
        FROM public.knowledge_chunks kc
        CROSS JOIN q
        CROSS JOIN LATERAL (SELECT to_tsvector('english', kc.content) AS tsv) d
        -- Same expression as the GIN index, so the index still applies
        WHERE to_tsvector('english', kc.content) @@ q.tsq
          AND (filter_metadata = '{}'::jsonb OR kc.metadata @> filter_metadata)
    )
    SELECT id, content, metadata, source, (coverage + freq)::real AS rank
    FROM scored
    ORDER BY coverage DESC, freq DESC
    LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;
