---
paths:
  - "frontend/**/*.{ts,tsx,js,jsx}"
---

# Frontend Rules (Next.js 16 + TypeScript)

- Use App Router (not Pages Router)
- Use React Server Components where possible, add "use client" only when needed
- Use 2-space indentation
- Use TypeScript strict mode — no `any` types
- Use Zod for runtime validation of API responses, except the chat stream (`lib/hooks/use-chat.ts`), which parses its SSE events with `JSON.parse` and a cast
- Use TanStack Query for all server state (no useState for API data), except the chat stream (`lib/hooks/use-chat.ts`), which keeps its streamed messages in useState
- Use Tailwind CSS v4 and the project's own primitives in `frontend/components/ui/` (shadcn/ui isn't installed) — no custom CSS unless absolutely necessary
- Components go in `frontend/components/`, pages in `frontend/app/`
- Use barrel exports from component directories
- Prefer named exports over default exports
- API calls go through `frontend/lib/api-client.ts`. Three exceptions: the chat stream (`lib/hooks/use-chat.ts`), the notify-me POST (`components/ui/notify-form.tsx`), and the browser headshot lookup (`lib/hooks/use-driver-photos.ts`), which moves server-side in Phase 1
