---
paths:
  - "**/*"
---

# Security Rules

## Secrets Management
- ALL secrets in environment variables, never in code
- Use backend/app/config.py (pydantic-settings) to load and validate at startup
- If a secret is accidentally committed: rotate immediately, force-push removal, update .gitignore

## Patterns to NEVER commit
- API keys: sk-, ghp_, gho_, AKIA, xox-, Bearer
- Supabase keys: eyJ (JWT tokens), sbp_
- Database URLs with credentials
- .env files with real values

## Input Validation
- All API request bodies validated with Pydantic models
- All database queries use parameterized statements (Supabase client handles this)
- Sanitize any user input displayed in the frontend (React handles this by default)

## Authentication
- Use Supabase Auth for user management
- Validate JWT tokens on every protected endpoint
- Row Level Security (RLS) policies on Supabase tables
