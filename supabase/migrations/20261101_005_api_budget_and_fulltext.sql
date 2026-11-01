-- Phase 0 revival: spend guardrails for billable APIs + full-text fallback search.

-- ── Monthly call ceilings for billable third-party APIs (HuggingFace) ──
-- Counted here, not in process memory, so the ceiling survives deploys.
CREATE TABLE IF NOT EXISTS public.api_usage (
    provider   TEXT        NOT NULL,
    period     TEXT        NOT NULL,  -- UTC month, 'YYYY-MM'
    calls      INTEGER     NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, period)
);

-- No policies: only the service role (which bypasses RLS) can read or write.
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- Atomically add p_units calls for this month; true while the total fits under p_limit.
CREATE OR REPLACE FUNCTION public.consume_api_budget(
    p_provider TEXT,
    p_limit    INTEGER,
    p_units    INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_period TEXT := to_char(timezone('utc', now()), 'YYYY-MM');
    v_calls  INTEGER;
BEGIN
    IF p_units < 1 OR p_limit < 0 THEN
        RAISE EXCEPTION 'consume_api_budget: invalid arguments';
    END IF;

    INSERT INTO public.api_usage AS u (provider, period, calls)
    VALUES (p_provider, v_period, p_units)
    ON CONFLICT (provider, period)
    DO UPDATE SET calls = u.calls + EXCLUDED.calls, updated_at = now()
    RETURNING u.calls INTO v_calls;

    RETURN v_calls <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_api_budget(TEXT, INTEGER, INTEGER)
    FROM PUBLIC, anon, authenticated;

-- ── Full-text fallback when embeddings are unavailable ──
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts
    ON public.knowledge_chunks
    USING GIN (to_tsvector('english', content));

-- Ranks chunks matching ANY query term (OR), so natural questions still hit.
CREATE OR REPLACE FUNCTION public.search_knowledge_text(
    query_text  TEXT,
    match_count INTEGER DEFAULT 5
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
    WITH q AS (
        SELECT to_tsquery(
            'english',
            replace(plainto_tsquery('english', query_text)::text, '&', '|')
        ) AS tsq
        WHERE plainto_tsquery('english', query_text)::text <> ''
    )
    SELECT kc.id, kc.content, kc.metadata, kc.source,
           ts_rank_cd(to_tsvector('english', kc.content), q.tsq) AS rank
    FROM public.knowledge_chunks kc, q
    WHERE to_tsvector('english', kc.content) @@ q.tsq
    ORDER BY rank DESC
    LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

REVOKE EXECUTE ON FUNCTION public.search_knowledge_text(TEXT, INTEGER)
    FROM PUBLIC, anon, authenticated;
