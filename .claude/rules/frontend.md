---
paths:
  - "frontend/**/*.{ts,tsx,js,jsx}"
---

# Frontend Rules (Next.js 15 + TypeScript)

- Use App Router (not Pages Router)
- Use React Server Components where possible, add "use client" only when needed
- Use 2-space indentation
- Use TypeScript strict mode — no `any` types
- Use Zod for runtime validation of API responses
- Use TanStack Query for all server state (no useState for API data)
- Use Tailwind CSS + shadcn/ui — no custom CSS unless absolutely necessary
- Components go in `frontend/components/`, pages in `frontend/app/`
- Use barrel exports from component directories
- Prefer named exports over default exports
- All API calls go through `frontend/lib/api-client.ts`
