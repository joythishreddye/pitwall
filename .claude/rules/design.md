---
paths:
  - "frontend/**/*.{ts,tsx,css}"
---

# F1 Design Standards — Enforced on Every Frontend File

You are building PitWall, a product for Formula 1 fans. Every UI element must feel like it belongs in the F1 world — premium, data-rich, and technically precise. Never produce generic dashboard UI.

## Non-Negotiable Rules

### Colors (always use Tailwind tokens, never raw hex in components)
- Background: `bg-f1-dark` (#0F0F0F) or `bg-f1-dark-2` (#1A1A1A)
- Borders: `border-f1-grid` (#2B2B2B) — subtle, not heavy
- Red (#DC0000): F1 brand, primary actions, alerts only
- Green (#00FF00): fastest lap/sector, positive deltas
- Yellow (#FFED00): personal best, attention-worthy
- Orange (#FF6B00): pit stops, warnings
- Cyan (#00C0FF): DRS, real-time data accents
- Every color must have a data meaning. No decorative color usage.

### Typography
- ALL numbers (lap times, positions, points, gaps, speeds) use `font-data` (JetBrains Mono via `@utility font-data` in globals.css)
- Text (names, descriptions, labels) uses the default sans font
- Never use decorative or novelty fonts

### Layout & Spacing
- Cards: `rounded-sm` maximum. No `rounded-lg` or `rounded-xl`. F1 broadcast graphics are sharp.
- Tables: alternating row backgrounds (`bg-f1-dark-2` / `bg-f1-dark-3`)
- Data density over whitespace. F1 fans want information, not empty space.
- No hero sections, no marketing fluff, no "Welcome to PitWall" splash screens.

### Team Colors (use from lib/constants/teams.ts)
- Always show team color as a left border bar or accent next to driver/team names
- Never hardcode team colors in components — import from the constants file

### Components — What Makes Them F1
- Data tables: sticky headers, sortable columns, compact rows (40-48px height)
- Position numbers: bold, monospace, slightly larger than surrounding text
- Gap/delta values: green if gaining, red if losing, monospace always
- Tire indicators: colored dots or badges (Red=Soft, Yellow=Medium, White=Hard, Green=Inter, Blue=Wet)
- Status badges: small, color-coded, icon + short text
- No empty states that just say "No data" — show a meaningful message about why and what's coming

### Animations
**Phase 1.5+: GSAP is the primary animation library. See `frontend/design-system/MASTER.md` for the full spec.**

Animation ownership:
- **GSAP:** DrawSVG circuit outlines, SplitText reveals, ScrollTrigger scroll choreography, Flip layout reordering, CustomEase counters, complex timelines
- **Framer Motion (keep):** `AnimatePresence` route transitions, `whileHover`/`whileTap` on Card micro-states only

Rules:
- All GSAP animations inside `useGSAP(() => { ... }, { scope: ref })` — never bare `gsap.to()` in components
- CustomEase curves: `pitwall-accel` (entrance), `pitwall-brake` (exit), `pitwall-pulse` (status)
- Duration caps: entrance 300-400ms, micro-interactions 150-200ms, DrawSVG 1.8-3.5s
- Transforms only — never animate `width`, `height`, or layout properties
- Always provide `prefers-reduced-motion` fallback via `respectsReducedMotion()` from `lib/gsap.ts`

### What "Rich and Classy" Means for F1
- Subtle depth: use slightly different background shades to create visual layers
- Accent lines: thin (1px) colored borders on the left side of cards or rows for visual hierarchy
- Team color integration: wherever a driver or team appears, their color should be present
- Real data previews: never show an empty card when you could show a data snippet
- Precision: lap times to 3 decimal places (1:23.456), gaps with +/- prefix, points as integers
