---
paths:
  - "**/*test*"
  - "**/*spec*"
  - "**/tests/**"
---

# Testing Rules

- Backend: pytest with fixtures, aim for 80%+ coverage
- Frontend: vitest + React Testing Library
- Use temporal splits for ML model evaluation — never leak future data
- Test RAG retrieval quality with canned queries
- Test API endpoints with httpx AsyncClient
- Mock external services (Groq, Supabase) in unit tests
- Integration tests hit real Supabase (test project)
