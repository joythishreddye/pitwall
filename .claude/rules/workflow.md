---
paths:
  - "**/*"
---

# Development Workflow

Every feature follows this pipeline:

1. **Plan** — Break down the feature, identify files to create/modify, check for existing patterns
2. **Test first** — Write failing tests before implementation (pytest for backend, vitest for frontend)
3. **Implement** — Write minimal code to make tests pass
4. **Review** — Self-review: check for security issues, type safety, error handling
5. **Commit** — Conventional commit with issue reference (e.g., `feat: add race prediction endpoint (closes #8)`)

# Pre-Commit Checklist (mental)
- No hardcoded secrets (API keys, tokens, passwords)
- No console.log or print() in production code (only in debug/dev blocks)
- No debugger statements
- TODOs reference a GitHub issue number
- All new functions have tests
- Pydantic models validate all external input
- SQL uses parameterized queries (never string interpolation)
