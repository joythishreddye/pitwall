---
paths:
  - "frontend/**/*.{ts,tsx,css}"
---

# Design: read DESIGN.md first

`DESIGN.md` at the repo root is PitWall's one design source: tokens, do's and don'ts, motion, the shell and the
known departures. Read it before changing anything a visitor sees. It replaced this file and
`frontend/design-system/MASTER.md` on 2026-11-25; where anything else disagrees, DESIGN.md wins.

The rules broken most often (DESIGN.md has the reasons):
- no text under 11px; small red text is `text-f1-red-text`, never `text-f1-red`;
- no LIVE label or pulsing dot outside a session;
- text is settled (no fade-in or count-up still running) within 400ms of appearing;
- Tailwind tokens only, never raw hex; team colours from `lib/constants/teams.ts`;
- GSAP only inside `useGSAP` with a scope ref; don't add Motion page transitions.
