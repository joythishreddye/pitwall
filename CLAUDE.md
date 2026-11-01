# PitWall — Your AI Race Engineer

## Project Overview
An AI-powered F1 platform that makes Formula 1 accessible to newcomers while giving depth to hardcore fans. Public, non-commercial, MIT-licensed code (data licenses in `DATA_LICENSE.md`).

**Repo:** https://github.com/joythishreddye/pitwall
**Issues:** `gh issue list`
**Current plan:** `~/.claude/plans/hi-claude-its-been-logical-planet.md` (revival + roadmap, written 2026-11-01)
**Status board:** https://claude.ai/artifact/W2TFHxDxEqXVS43CLAQYqd (live telemetry and checklist; update via ArtifactData)

## Architecture
- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + TanStack Query + GSAP (primary animation) + Motion; on Vercel
- **Backend:** Python 3.12 FastAPI on Render Starter ($7/mo, always on)
- **Database:** Supabase Postgres + pgvector (Free tier; a keep-alive cron prevents pausing)
- **LLM:** Groq via the provider abstraction. `LLM_MODEL=openai/gpt-oss-120b` (answers), `LLM_INTENT_MODEL=openai/gpt-oss-20b` (intent JSON). Groq rate-limits each model separately.
- **Embeddings:** BAAI/bge-base-en-v1.5 (768 dim). Queries go through the HuggingFace router; ingestion runs locally with sentence-transformers.
- **Entity linker:** `app/rag/entities.py` maps classifier entities to knowledge-base refs and builds the filter. Category-only filters are never used (they hid the regulations docs).
- **Reranker:** bge-reranker-base, **off by default** (`RERANK_ENABLED=false`). On the eval it lowered hit@5 from 100% to 96.4% and MRR from 0.91 to 0.72.
- **Spend guard:** `consume_api_budget()` in Postgres caps HF calls per month (`HF_MONTHLY_CALL_LIMIT`). Without embeddings, retrieval falls back to `search_knowledge_text()` (full-text search).
- **Redis (Upstash):** optional and unused. Its database was deleted in 2026; don't add hard dependencies on it.
- **CI:** `.github/workflows/ci.yml` (ruff, pytest, eslint, tsc, next build) and `keepalive.yml` (readiness ping twice a day)

## Pillars
1. **Race Engineer chat:** RAG (intent → entity linking → vector search + per-entity searches; rerank off by default); becomes a tool-calling agent in Phase 4
2. **Predictions:** baselines vs Plackett-Luce vs LightGBM, a public prediction log written before each session, a Monte Carlo championship simulator
3. **Live:** public replay-as-if-live from OpenF1 history, plus a personal live bridge on the owner's Mac (F1 TV login, local only)
4. **Academy:** learning path, quizzes, gamification. Never call it "F1 Academy" (F1 ACADEMY is a trademark).

## Data sources (2026 reality)
- **Jolpica:** results, qualifying, standings, schedules. No auth; CC BY-NC-SA 4.0.
- **OpenF1:** historical 2023+ laps, stints, pit stops, weather, race control, positions. No auth on the free tier, 3 req/s, CC BY-NC-SA 4.0. Primary timing source from Phase 1.
- **FastF1:** since 2026-10-15 F1's archive returns 401 without an F1 TV login, and F1 blocks cloud IPs. FastF1 ≥3.9 runs **locally only**, with the owner's own F1 TV login. Never use it in CI or on Render.
- **f1db:** 1950–2017 backfill (#18), CC BY 4.0.
- PostgREST caps responses at 1,000 rows. Page with `.range()` (see `_fetch_all` in `generate_knowledge.py`); `.limit()` alone silently truncates.

## Local Prerequisites
- **Node.js:** 20.9+ (v23 at /opt/homebrew/bin/node); **pnpm** 10
- **Python:** 3.12 (`/opt/homebrew/bin/python3.12`). Not 3.14; ML packages lag.
- **Virtual env:** `backend/venv`

## Key Commands
```bash
# Frontend
cd frontend && pnpm dev                 # dev server
cd frontend && pnpm lint                # ESLint (must be 0 errors)
cd frontend && pnpm exec tsc --noEmit   # type-check
cd frontend && pnpm build               # production build
# (no frontend unit tests yet; vitest is planned)

# Backend
cd backend && python -m uvicorn app.main:app --reload
cd backend && pytest                    # 126 tests, all external services mocked
cd backend && ruff check . && ruff format --check .

# Data
cd backend && python scripts/seed_database.py --seasons 2026 --skip-fastf1   # Jolpica refresh
cd backend && python scripts/ingest_knowledge.py                             # regenerate docs + re-embed locally
cd backend && python scripts/eval_rag.py                                     # retrieval eval (55 Qs, local models, ~4 min)

# Health
curl https://pitwall-api-dfyi.onrender.com/health/ready     # deep: ?deep=true + X-Health-Token header
```

## Claude Code Tools Available
**Skills:** `/frontend`, `/backend`, `/test`, `/issue`
**Agents:** `frontend-expert`, `backend-expert`, `ml-expert`, `code-reviewer` (run before pushes)
**Rules** (auto-loaded by path): `frontend.md`, `design.md`, `backend.md`, `security.md`, `testing.md`, `workflow.md`

## Code Conventions
- **TypeScript:** strict, 2-space indent, App Router, Zod for API validation, React Compiler lint rules (no refs read during render, no synchronous setState in effects)
- **Python:** Ruff (lint + format), Pydantic v2, async I/O; providers raise `LLMError`, and routes never import a vendor SDK
- **Commits:** `feat|fix|refactor|test|docs|chore|data: description (closes #N)`
- **Branches:** `main` (production; pushing deploys Vercel), `feature/*`, `fix/*`

## Critical Rules
- Check GitHub issues (`gh issue view <N>`) before starting work
- Use the LLM provider abstraction (`backend/app/llm/base.py`); model ids come from env, never code
- Secrets only in env vars; Render holds production env
- ML models use temporal train/test splits; never leak future data
- Every chat or retrieval change must beat the eval: 100% hit@5, MRR 0.91 on `backend/evals/rag_gold.json` (`backend/scripts/eval_rag.py`)
- Ask Joythish before any new paid service. HF spend is capped at $5 (see memory).
- Self-review before committing: security, types, error handling
