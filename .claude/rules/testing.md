---
paths:
  - "**/*test*"
  - "**/*spec*"
  - "**/tests/**"
---

# Testing Rules

- Backend: pytest with fixtures, aim for 80%+ coverage
- Frontend: vitest for plain functions under `lib/` (`lib/**/*.test.ts`, node environment, `frontend/vitest.config.mts`); Playwright for pages (`frontend/e2e/`). React Testing Library isn't installed: test a component through its page in e2e
- Use temporal splits for ML model evaluation — never leak future data
- Test RAG retrieval quality with canned queries
- Test API endpoints with httpx AsyncClient. The exception is test_traffic.py: it tests the traffic guard through FastAPI's TestClient, on a small app it builds
- Mock external services (Groq, Supabase) in unit tests
- No test hits a real Supabase, and there is no Supabase test project: every test mocks external services
