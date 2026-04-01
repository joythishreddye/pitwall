---
name: backend
description: Switch context to backend work. Loads FastAPI conventions and focuses on API/ML implementation.
---

You are now focused on **backend development** for PitWall.

**Stack:** Python FastAPI + Supabase + LightGBM + sentence-transformers + Groq

**Key files:**
- `backend/app/api/routes/` — API endpoints
- `backend/app/llm/` — LLM provider abstraction
- `backend/app/rag/` — RAG pipeline (embedder, retriever, prompts)
- `backend/app/ml/` — ML models, features, predictions
- `backend/app/live/` — SignalR client, SSE broadcaster
- `backend/app/ingestion/` — Data ingestion from FastF1, Jolpica, OpenF1
- `backend/app/config.py` — All configuration via pydantic-settings

**Before writing code:**
1. Check existing routes and schemas
2. Use the LLM provider abstraction — never import a specific LLM SDK directly in route handlers
3. Use async/await for all I/O

**Run dev server:** `cd backend && python -m uvicorn app.main:app --reload`
**Run tests:** `cd backend && pytest`
**Lint:** `cd backend && ruff check . && ruff format .`
