# PitWall — Your AI Race Engineer

## Project Overview
An AI-powered F1 intelligence platform that makes Formula 1 accessible to newcomers while providing depth for hardcore fans. Built as a public product showcasing AI/ML engineering skills.

**Repo:** https://github.com/joythishreddye/pitwall
**Issues:** `gh issue list` — 17 issues across 4 phases, each with detailed acceptance criteria
**Plan:** See `.claude/plans/compiled-skipping-torvalds.md` for full architecture design

## Architecture
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + Recharts
- **Backend:** Python FastAPI on Render ($7/mo, always-on)
- **Database:** Supabase PostgreSQL + pgvector (500MB free)
- **Cache:** Upstash Redis (500K commands/mo free)
- **LLM:** Groq (Llama 3.1 70B) with provider abstraction for Claude API swap
- **Embeddings:** BAAI/bge-base-en-v1.5 (768 dim) + cross-encoder/ms-marco-MiniLM-L-6-v2 reranker
- **ML:** LightGBM (lambdarank) for race/qualifying predictions
- **Real-time:** F1 SignalR feed → Redis → SSE to frontend
- **Team Radio:** OpenAI Whisper (open-source) for transcription
- **Frontend hosting:** Vercel free tier
- **CI/CD:** GitHub Actions

## 4 Pillars
1. **AI Race Companion** — LLM + RAG chat with 3-stage retrieval (intent→vector→rerank)
2. **Predictive Intelligence** — LightGBM LTR race/qualifying predictions + Monte Carlo championship simulation + strategy "What If" engine
3. **Live Race Dashboard** — F1 SignalR real-time feed + AI-generated insights (rules + ML hybrid)
4. **F1 Academy** — Interactive learning modules with quiz engine and gamification

## Environment Variables
All secrets go in `.env` files (never committed). See `.env.example` for the full list.
```
# Backend (.env)
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # Backend only, never expose to client
GROQ_API_KEY=gsk_...                    # Groq console → API Keys
UPSTASH_REDIS_REST_URL=https://...      # Upstash dashboard
UPSTASH_REDIS_REST_TOKEN=...
LLM_PROVIDER=groq                       # groq | anthropic | gemini
SECRET_KEY=...                          # Random string for JWT signing

# Frontend (.env.local)
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # Safe for browser (use RLS)
NEXT_PUBLIC_API_URL=http://localhost:8000  # Backend URL
```

## Data Sources (No Auth Required)
- **FastF1** — `pip install fastf1`, no API key
- **Jolpica API** — `http://api.jolpi.ca/ergast/f1/`, no auth, 200 req/hr
- **OpenF1 API** — `https://openf1.org/`, no auth for free tier, 3 req/s
- **f1db** — download SQL dump from GitHub releases, CC BY 4.0

## Local Prerequisites
- **Node.js:** v23+ (installed at /opt/homebrew/bin/node)
- **pnpm:** Install with `npm install -g pnpm`
- **Python:** Use 3.12 specifically (`/opt/homebrew/bin/python3.12`) — NOT 3.14 (ML packages don't support it yet)
- **Virtual env:** `python3.12 -m venv venv` in backend/

## Key Commands
```bash
# Frontend
cd frontend && pnpm dev              # Start dev server
cd frontend && pnpm build            # Production build
cd frontend && pnpm lint             # Lint TypeScript
cd frontend && pnpm test             # Run tests

# Backend
cd backend && python -m uvicorn app.main:app --reload  # Start dev server
cd backend && pytest                  # Run tests
cd backend && ruff check .           # Lint Python
cd backend && ruff format .          # Format Python

# Data
cd backend && python scripts/seed_database.py    # Seed historical data
cd backend && python scripts/train_model.py      # Train ML models

# GitHub
gh issue list                        # View all issues
gh issue view <number>               # View specific issue with full details
```

## Claude Code Tools Available
**Skills** (slash commands):
- `/frontend` — Switch context to frontend work (Next.js patterns, component library)
- `/backend` — Switch context to backend work (FastAPI, Supabase, ML)
- `/test` — Run test suite (auto-detects frontend vs backend)
- `/issue` — Create a GitHub issue from current context

**Agents** (specialized subagents):
- `frontend-expert` — Next.js, React, TypeScript, TailwindCSS, Recharts (Pillars 3, 4 UI)
- `backend-expert` — FastAPI, Supabase, Redis, data pipelines (Pillars 1-4 backend)
- `ml-expert` — LightGBM, RAG pipeline, SHAP, Monte Carlo, Whisper (Pillars 1, 2, 3 AI)

**Rules** (auto-loaded by file path):
- `frontend.md` — Next.js conventions (loaded for `frontend/**/*.{ts,tsx}`)
- `backend.md` — FastAPI conventions (loaded for `backend/**/*.py`)
- `security.md` — Secret patterns, input validation (loaded for all files)
- `testing.md` — pytest/vitest patterns (loaded for test files)
- `workflow.md` — plan→test→implement→review→commit pipeline (loaded for all files)

## Code Conventions
- **TypeScript:** Strict mode, 2-space indent, App Router patterns, Zod for validation
- **Python:** PEP 8 via Ruff, 4-space indent, Pydantic v2, async/await for all I/O
- **Commits:** `feat|fix|refactor|test|docs|chore: description (closes #N)`
- **Testing:** pytest (backend, 80%+ coverage), vitest (frontend)
- **Branches:** `main` (production), `feature/*`, `fix/*`

## Critical Rules
- Always check GitHub issues (`gh issue view <N>`) before starting work
- Use the LLM provider abstraction (`backend/app/llm/base.py`) — never hardcode a specific LLM
- Store secrets in environment variables, never in code
- RAG uses 3-stage retrieval: intent classification → vector search → cross-encoder reranking
- ML models use temporal train/test splits — never leak future data
- Self-review all code before committing: security, types, error handling
- License: MIT. Credit data sources (FastF1, OpenF1, f1db) in README.

## GitHub Issues Roadmap
Phase 1 (Foundation): #1 Supabase schema, #2 Data ingestion, #3 FastAPI skeleton, #4 Next.js frontend, #5 RAG chat, #6 Race data API
Phase 2 (Predictions): #7 Feature engineering, #8 ML models, #9 Monte Carlo + strategy, #10 Predictions UI
Phase 3 (Live Race): #11 SignalR consumer, #12 Live dashboard UI, #13 Insight engine
Phase 4 (Academy): #14 Learning modules, #15 Gamification, #16 Polish + launch
Cross-cutting: #17 Post-race pipeline
