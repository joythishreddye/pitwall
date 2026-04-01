---
paths:
  - "backend/**/*.py"
---

# Backend Rules (Python FastAPI)

- Use async/await for all I/O operations
- Use Pydantic v2 for all request/response schemas
- Use dependency injection via FastAPI's Depends()
- Use Google-style docstrings for public functions
- Use Ruff for linting and formatting (not Black/isort separately)
- Never hardcode LLM provider — always use the provider abstraction in `backend/app/llm/base.py`
- Database access goes through `backend/app/db/supabase.py`
- All routes go in `backend/app/api/routes/` with one file per domain
- Use environment variables for all secrets and config via `backend/app/config.py`
- ML models are loaded once at startup, not per-request
- Feature engineering code goes in `backend/app/ml/features.py`
