---
paths:
  - "**/*test*"
  - "**/*spec*"
  - "**/tests/**"
---

# Testing Rules

- Backend: pytest with fixtures, aim for 80%+ coverage
- Frontend: no unit tests yet. vitest and React Testing Library are planned; neither is installed
- Use temporal splits for ML model evaluation — never leak future data
- Test RAG retrieval quality with canned queries
- Test API endpoints with httpx AsyncClient
- Mock external services (Groq, Supabase) in unit tests
- No test hits a real Supabase, and there is no Supabase test project: every test mocks external services
