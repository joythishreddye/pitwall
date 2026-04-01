---
name: frontend
description: Switch context to frontend work. Loads Next.js conventions and focuses on UI implementation.
---

You are now focused on **frontend development** for PitWall.

**Stack:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query + Recharts

**Key files:**
- `frontend/app/` — Pages and layouts
- `frontend/components/` — Reusable components
- `frontend/lib/api-client.ts` — Typed API client
- `frontend/lib/hooks/` — TanStack Query hooks

**Before writing code:**
1. Check existing components in `frontend/components/`
2. Check the API client for existing endpoints
3. Follow the patterns already established in the codebase

**Run dev server:** `cd frontend && pnpm dev`
**Run tests:** `cd frontend && pnpm test`
**Lint:** `cd frontend && pnpm lint`
