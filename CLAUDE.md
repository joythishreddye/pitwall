# PitWall — Your AI Race Engineer

An AI-powered F1 platform that makes Formula 1 accessible to newcomers while giving depth to hardcore fans. Public, non-commercial, MIT-licensed code (data licenses in `DATA_LICENSE.md`).

- **Repo:** https://github.com/joythishreddye/pitwall. **Issues:** `gh issue list`
- **Project state** (the current task, plan, roadmap, decisions and open questions) lives in `.brain/`. It's gitignored, so search skips it: read `.brain/PLAN.md` by path.

## Critical Rules
- Check GitHub issues (`gh issue view <N>`) before starting work
- **Ask Joythish before any push, and before any merge to main:** a push to main deploys Vercel and Render (production)
- Use the LLM provider abstraction (`backend/app/llm/base.py`); model ids come from env, never code
- Secrets only in env vars; Render holds production env
- ML models use temporal train/test splits; never leak future data
- Every chat or retrieval change re-runs `backend/scripts/eval_rag.py` and must not regress the last recorded run in `backend/evals/results/` (gold v2). No question may go from hit to miss, and production mode (vector+intent) hit@5 and MRR@5 may not drop. Last run: 2026-11-01T2233Z, 100% / 0.912.
- Every knowledge ingest re-runs the eval too, under the same rule (`ingest_knowledge.py`, including the one after a data refresh)
- Self-review before committing: security, types, error handling
- The pillar is "Academy". Never call it "F1 Academy" (F1 ACADEMY is a trademark).

## Money (Joythish's limits)
- **Render:** at most $7 a month (Starter, always on). Its one charge without a cap is outbound bandwidth: see the bandwidth guard.
- **HuggingFace:** at most $5 of prepaid credits, with auto-recharge off.
- **Nothing** may cost more than $10 without telling Joythish first. Flag any spend beyond these limits before it happens.
- Ask Joythish before any new paid service. Joythish makes every payment.

## Gates
In order (see `~/.claude/CLAUDE.md`): the project gates, floor, verify-outcome for UI changes once `verify.json` exists, then codex-review (Codex plus the reviewer agent) at task end and before any push.

The project gates, run from the repo root, in the foreground and unpiped:
```bash
cd backend && source venv/bin/activate && ruff check . && ruff format --check .
cd backend && source venv/bin/activate && pytest -q   # all external services mocked
cd frontend && pnpm lint                              # ESLint (must be 0 errors)
cd frontend && node_modules/.bin/tsc --noEmit         # type-check
cd frontend && pnpm build                             # production build
# (no frontend unit tests yet; vitest is planned)
```
Use these exact forms. `pytest` and `ruff` live in `backend/venv`, so a bare call exits 127. The gate hooks (the save nudge and the gate-failure record) recognize only the command forms in `~/.claude/brain/bin/gate-re.sh`, so another runner or path goes unrecorded.

## Other commands (not gates)
```bash
cd backend && source venv/bin/activate && python -m uvicorn app.main:app --reload   # API dev server
cd frontend && pnpm dev                                                             # web dev server
cd backend && source venv/bin/activate && python scripts/seed_database.py --seasons 2026 --skip-fastf1   # Jolpica refresh
cd backend && source venv/bin/activate && python scripts/ingest_knowledge.py        # regenerate docs + re-embed locally
cd backend && source venv/bin/activate && python scripts/eval_rag.py                # retrieval eval (55 Qs, local models, ~4 min)
curl https://pitwall-api-dfyi.onrender.com/health/ready     # deep: ?deep=true + X-Health-Token header
```
`eval_rag.py` isn't a gate yet: it exits 0 even on a regression. Compare its new file in `backend/evals/results/` with the last recorded run yourself.

## Local Prerequisites
- **Python:** 3.12 (`/opt/homebrew/bin/python3.12`). Not 3.14; ML packages lag.
- **Virtual env:** `backend/venv`
- **Node.js:** 20.9+ (v23 at /opt/homebrew/bin/node); **pnpm** 10

## Gotchas

### Chat retrieval
- **Vector search is exact.** Migration 008 dropped the HNSW index.
  - **Why:** at about 1k chunks a scan takes about 10 ms, while the HNSW graph degraded after swap ingests. It returned unrelated documents for "Who won the 2024 Miami GP?".
  - **When to change:** add an approximate index back only past about 50k chunks, rebuilt after each bulk load.
- **Reranker:** bge-reranker-base, **off by default** (`RERANK_ENABLED=false`). On the eval it lowered hit@5 from 100% to 98.2% and MRR@5 from 0.91 to 0.74, and added ~0.9 s.
- **Entity linker:** `backend/app/rag/entities.py` maps classifier entities to knowledge-base refs and builds the filter. Category-only filters are never used (they hid the regulations docs).
- **Entity linking rule:** filters come from entities the classifier named (repaired to KB refs) and from unambiguous names in the question: full names, team and circuit names, circuit cities. The classifier doesn't know the 2026 newcomers, so the scan is needed.
  - **Weak aliases** only repair classifier output; a scan skips them. They are country names (including the refs `bahrain` and `monaco`), places that are also people or words (`americas`, `villeneuve`, `rodriguez`, `ricard`, `vegas`), word-like surnames (`stroll`) and `aston`.
  - **Race names:** a weak circuit alias counts inside a race name ("Monaco Grand Prix", "Singapore GP").
  - **Comparisons:** several entities of one kind get no filter, but a targeted search and a guaranteed slot each.
  - **Relaxing:** empty filters relax to season-only, then to none, judged on the filtered search alone.
- **Embeddings:** BAAI/bge-base-en-v1.5 (768 dim). Queries go through the HuggingFace router; ingestion runs locally with sentence-transformers.
- **Spend guard:** `consume_api_budget()` in Postgres caps HF calls per month (`HF_MONTHLY_CALL_LIMIT`). Without embeddings, retrieval falls back to `search_knowledge_text()` (full-text search).
- **LLM:** Groq, through the provider abstraction. `LLM_MODEL` writes the answers and `LLM_INTENT_MODEL` the intent JSON. Groq rate-limits each model separately.

### Bandwidth guard
- `backend/app/api/traffic.py` meters response bytes (headers and bodies) and request rate on every route except `/health*` (`API_DAILY_MB`, `API_DAILY_MB_PER_IP`, `API_REQUESTS_PER_MINUTE_PER_IP`).
  - **Defaults:** 150 MB a day overall, 15 MB a day per client, 120 requests a minute per client.
  - **Past the global budget,** the API answers 503 until midnight UTC.
  - **Not capped:** refusals and health checks. One source sending 100 refused requests a second adds about 3.5 GB a day.
  - **Not capped or counted:** CORS preflights. The CORS layer answers them before the guard runs.
  - **Alerting:** refusals and unmetered requests (health checks) are counted in `/health/ready` (`traffic`). `keepalive.yml` fails, and GitHub emails the owner, when the budget closes or either count passes 100k a day.
  - **Hard cap:** only an edge rate limit could cap refusals.
  - **Why:** Render bills outbound bandwidth beyond 5 GB a month and can't cap it, and the Render bill must stay at $7 a month.

### Data sources (2026 reality)
- **Jolpica:** results, qualifying, standings, schedules. No auth; CC BY-NC-SA 4.0.
- **OpenF1:** historical 2023+ laps, stints, pit stops, weather, race control, positions. Free tier: no auth, 3 req/s, CC BY-NC-SA 4.0. Primary timing source from Phase 1.
  - **Live-session block (verified 2026-11-01):** during any live F1 session, OpenF1 returns 401 to unauthenticated clients for all data, past sessions included.
  - **So:** ingest after sessions end, retrying on 401; pre-ingest replays; and don't depend on OpenF1 when a page is viewed.
  - **One exception:** the browser headshot lookup (`frontend/lib/hooks/use-driver-photos.ts`). It falls back to the driver code and moves server-side in Phase 1.
- **FastF1:** since 2026-10-15 F1's archive returns 401 without an F1 TV login, and F1 blocks cloud IPs. FastF1 ≥3.9 runs **locally only**, with the owner's own F1 TV login. Never use it in CI or on Render.
- **f1db:** 1950–2017 backfill (#18), CC BY 4.0.
- PostgREST caps responses at 1,000 rows. Page with `.range()` (see `fetch_all` in `backend/app/db/supabase.py`); `.limit()` alone silently truncates.

### Infrastructure
- **Database:** Supabase Postgres + pgvector (Free tier; a keep-alive cron prevents pausing).
- **Redis (Upstash):** optional and unused. Its database was deleted in 2026; don't add hard dependencies on it.

## Code Conventions
- **TypeScript:** strict, 2-space indent, App Router, Zod for API validation, React Compiler lint rules (no refs read during render, no synchronous setState in effects)
- **Python:** Ruff (lint + format), Pydantic v2, async I/O; providers raise `LLMError`, and routes never import a vendor SDK
- **Commits:** `feat|fix|refactor|test|docs|chore|data: description (closes #N)`
- **Branches:** `main` (production; pushing deploys Vercel and Render), `feature/*`, `fix/*`
- **Claude Code:** the `/issue` skill. Rules auto-load by path from `.claude/rules/`: `frontend.md`, `design.md`, `backend.md`, `security.md`, `testing.md`, `workflow.md`
