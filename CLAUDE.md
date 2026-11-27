# PitWall — Your AI Race Engineer

An AI-powered F1 platform that makes Formula 1 accessible to newcomers while giving depth to hardcore fans. Public, non-commercial, MIT-licensed code (data licenses in `DATA_LICENSE.md`).

- **Repo:** https://github.com/joythishreddye/pitwall. **Issues:** `gh issue list`
- **Project state** (the current task, plan, roadmap, decisions and open questions) lives in `.brain/`. It's gitignored, so search skips it: read `.brain/PLAN.md` by path.

## Critical Rules
- Check GitHub issues (`gh issue view <N>`) before starting work
- **Claude decides when to push and merge to main,** after the gates pass. Joythish reviews the UI and features.
  - Main takes pull requests only: a GitHub ruleset requires both CI checks and has no bypass, Joythish included. Merge with `gh pr merge`.
  - Cloud sessions (claude.ai/code) push only their own `claude/` branch and never merge. Merges happen in the local session, after the gates.
  - A merge to main deploys Vercel, and Render only when it changes `backend/`.
- Use the LLM provider abstraction (`backend/app/llm/base.py`); model ids come from env, never code
- Secrets only in env vars; Render holds production env
- ML models use temporal train/test splits; never leak future data
- Every chat or retrieval code change re-runs `backend/scripts/eval_rag.py` and must not regress the latest recorded run on the same data in `backend/evals/results/` (gold v2). In production mode (vector+intent), no question may go from hit to miss, and hit@5 and MRR@5 may not drop. Other modes are reported, not gated. Last run: 2026-11-27T1744Z, 100% / 0.891 (with the chat limits; same data as the round 21 refresh).
- Every knowledge ingest re-runs the eval too (`ingest_knowledge.py`, including the one after a data refresh), with a data-update bar.
  - **It passes** if, in production mode (vector+intent), no question goes from hit to miss and hit@5 doesn't drop.
  - **An MRR@5 drop is reported to Joythish, not blocking.** New numbers reorder near-tied pages after most refreshes, and the chat reads all five top chunks for each answer (`backend/app/rag/retriever.py`).
  - **An automated refresh** runs the eval before it swaps the new knowledge in, and swaps only if the bar passes.
- Self-review before committing: security, types, error handling
- The pillar is "Academy". Never call it "F1 Academy" (F1 ACADEMY is a trademark).

## Money (Joythish's limits)
- **Render:** at most $7 a month (Starter, always on). Its one charge without a cap is outbound bandwidth: see the bandwidth guard.
- **HuggingFace:** at most $5 of prepaid credits, with auto-recharge off.
- **Nothing** may cost more than $10 without telling Joythish first. Flag any spend beyond these limits before it happens.
- Ask Joythish before any new paid service. Joythish makes every payment.

## Gates
In order (see `~/.claude/CLAUDE.md`): the project gates, floor, verify-outcome for any change under `frontend/` (`verify.json`), then codex-review (Codex plus the reviewer agent) at task end and before any push.

The project gates, run from the repo root, in the foreground and unpiped:
```bash
(cd backend && source venv/bin/activate && ruff check . && ruff format --check .)
(cd backend && source venv/bin/activate && pytest -q)   # all external services mocked
(cd frontend && pnpm lint)                              # ESLint (must be 0 errors)
(cd frontend && node_modules/.bin/tsc --noEmit)         # type-check
(cd frontend && pnpm build)                             # production build
# (no frontend unit tests yet; vitest is planned)
```
Use these exact forms. The parentheses keep each `cd` (and the venv) inside a subshell: Claude Code's shell keeps a successful `cd`, so without them the next line's `cd` fails. `pytest` and `ruff` live in `backend/venv`, so a bare call exits 127. The gate hooks (the save nudge and the gate-failure record) recognize only the command forms in `~/.claude/brain/bin/gate-re.sh`, so another runner or path goes unrecorded.

The UI gate (`python3 ~/.claude/gates/bin/gates.py verify-outcome`, from the repo root) builds with `pnpm build:e2e`, serves with `e2e/serve.mjs` and runs `frontend/e2e/` (Playwright 1.64.1, exact) at 1440, 768 and 390. `DESIGN.md` is the design source it judges against.
- **Pages talk only to the fixture API** (`frontend/e2e/fixture-api.mjs`, saved JSON in `e2e/fixtures/`). A page that calls a path with no fixture gets a 404, a console error and a FAIL: add the fixture, never point the build at production.
- **Baselines** (`e2e/*-snapshots/`, darwin only, so e2e stays out of CI): regenerating needs Joythish's OK, then `(cd frontend && pnpm build:e2e)` and `(cd frontend && npm run e2e -- --update-snapshots=all --workers=1)`, not `pnpm build`. Approving needs a second OK (the verify-outcome skill).
- **After a gate run `.next` holds the fixture build;** `serve.mjs` refuses any other build, and `pnpm build` restores the real one.

## Other commands (not gates)
```bash
(cd backend && source venv/bin/activate && python -m uvicorn app.main:app --reload)   # API dev server
(cd frontend && pnpm dev)                                                             # web dev server
(cd backend && source venv/bin/activate && python scripts/seed_database.py --seasons 2026 --skip-fastf1 --standings-every-round)   # Jolpica refresh; the flag re-reads every round's standings, for the points chart
(cd backend && source venv/bin/activate && python scripts/ingest_knowledge.py)        # regenerate docs + re-embed locally
(cd backend && source venv/bin/activate && python scripts/eval_rag.py)                # retrieval eval (55 Qs, local models, ~4 min)
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
- **Reranker:** bge-reranker-base, **off by default** (`RERANK_ENABLED=false`). On the Nov 1 eval it lowered hit@5 from 100% to 98.2% and MRR@5 from 0.91 to 0.74, and added ~0.9 s.
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
- **OpenF1:** historical 2023+ laps, stints, pit stops, weather, race control, positions. Free tier: no auth, 3 requests a second and 30 a minute, CC BY-NC-SA 4.0. Primary timing source from Phase 1.
  - **Live-session block (verified 2026-11-01):** from 30 minutes before any F1 session until 30 minutes after it ends, OpenF1 returns 401 to unauthenticated clients for all data, past sessions included. The 30 minutes come from OpenF1's FAQ (read 2026-11-26), which calls that window live.
  - **So:** ingest after sessions end, retrying on 401; pre-ingest replays; and don't depend on OpenF1 when a page is viewed.
  - **One exception:** the browser headshot lookup (`frontend/lib/hooks/use-driver-photos.ts`). It falls back to the driver code and moves server-side in Phase 1.
- **FastF1:** since 2026-10-15 F1's archive returns 401 without an F1 TV login, and F1 blocks cloud IPs. FastF1 ≥3.9 runs **locally only**, with the owner's own F1 TV login. Never use it in CI or on Render.
  - **A free F1 account's live feed lacks the track map and telemetry.** `fastf1.livetiming save` with a free sign-in gets timing, tyres, pit in/out, race control and weather, but never subscribes `Position.z` or `CarData.z` (checked 2026-11-19, Vegas FP2).
- **f1db:** 1950–2017 backfill (#18), CC BY 4.0.
- PostgREST caps responses at 1,000 rows. Page with `.range()` (see `fetch_all` in `backend/app/db/supabase.py`); `.limit()` alone silently truncates.

### Infrastructure
- **Database:** Supabase Postgres + pgvector (Free tier; a keep-alive cron prevents pausing).
- **Redis (Upstash):** optional and unused. Its database was deleted in 2026; don't add hard dependencies on it.

## Code Conventions
- **TypeScript:** strict, 2-space indent, App Router, Zod for API validation, React Compiler lint rules (no refs read during render, no synchronous setState in effects)
- **Python:** Ruff (lint + format), Pydantic v2, async I/O; providers raise `LLMError`, and routes never import a vendor SDK
- **Commits:** `feat|fix|refactor|test|docs|chore|data: description (closes #N)`
- **Branches:** `main` (production; pull requests only, see Critical Rules), `feature/*`, `fix/*`, and `claude/*` from cloud sessions
- **Claude Code:** the `/issue` skill. Rules auto-load by path from `.claude/rules/`: `frontend.md`, `design.md`, `backend.md`, `security.md`, `testing.md`, `workflow.md`
