# PitWall — Your AI Race Engineer

## Project Overview
An AI-powered F1 intelligence platform that makes Formula 1 accessible to newcomers while providing depth for hardcore fans. Built as a public product showcasing AI/ML engineering skills.

**Live repo:** https://github.com/joythishreddye/pitwall

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

## Data Sources
- **FastF1** (Python lib) — telemetry, lap times, tire data, weather (from 2018+)
- **Jolpica API** — historical results, standings, drivers (from 1950+)
- **OpenF1 API** — car data, positions, intervals, team radio (from 2023+)
- **f1db** — complete historical database (from 1950+, CC BY 4.0)
- **F1 SignalR** — live timing data (real-time, ~3s delay)

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

# Git
gh issue list                        # View GitHub issues
gh issue view <number>               # View specific issue
```

## Code Conventions
- **TypeScript:** Strict mode, 2-space indent, App Router patterns, Zod for validation
- **Python:** PEP 8 via Ruff, 4-space indent, Pydantic v2, async/await for all I/O, Google-style docstrings
- **Commits:** Conventional commits (feat/fix/refactor/test/docs/chore), reference issue numbers
- **Testing:** pytest (backend, 80%+ coverage), vitest (frontend)
- **Branches:** `main` (production), `develop` (integration), `feature/*`, `fix/*`

## Important Notes
- Always check GitHub issues before starting work — each feature has a detailed issue
- Use the LLM provider abstraction (`backend/app/llm/base.py`) — never hardcode a specific LLM
- Store secrets in environment variables, never in code
- RAG knowledge base uses 3-stage retrieval: intent classification → vector search → cross-encoder reranking
- ML models use temporal train/test splits — never leak future data
- License: MIT. Credit data sources (FastF1, OpenF1, f1db) in README.
