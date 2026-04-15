# PitWall Design System — Master File

> **Hierarchy:** When building a specific page, check `design-system/pages/[page].md` first.
> If a page override exists, its rules take precedence over this file.
> Otherwise, follow the rules below strictly.

**Project:** PitWall — AI Race Engineer
**Aesthetic:** HUD / Mission-Critical Engineering Precision
**Theme:** Dark only (no light mode)

---

## Identity

PitWall looks like an F1 pit wall engineer's screen — dense with data, high-contrast numerics, grid-line structure, and team color accents. It is **not** a luxury SaaS product. Every pixel serves a function.

---

## Color System

### Surfaces (elevation via color steps, not shadows)

| Token | Hex | Usage |
|-------|-----|-------|
| `f1-dark` | `#0F0F0F` | Page background, base layer |
| `f1-dark-2` | `#1A1A1A` | Cards, sidebar, panels |
| `f1-dark-3` | `#252525` | Elevated elements, hover states |
| `f1-grid` | `#2B2B2B` | Borders, dividers, grid lines |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `f1-text` | `#E5E5E5` | Primary text, headings, values |
| `f1-muted` | `#A3A3A3` | Secondary text, labels, captions |

### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| `f1-red` | `#DC0000` | Brand, active states, critical alerts, position gains |
| `f1-green` | `#00FF00` | DRS enabled, positive delta, sector improvements |
| `f1-yellow` | `#FFED00` | Yellow flag, caution states |
| `f1-orange` | `#FF6B00` | Safety car, warning states |
| `f1-cyan` | `#00C0FF` | AI/data highlights, info states |
| `f1-purple` | `#A855F7` | Fastest lap indicator |

### Position

| Token | Hex | Usage |
|-------|-----|-------|
| `f1-gold` | `#FFD700` | P1 |
| `f1-silver` | `#C0C0C0` | P2 |
| `f1-bronze` | `#CD7F32` | P3 |

### Team Colors

| Team | Token | Hex |
|------|-------|-----|
| Red Bull | `team-red-bull` | `#3671C6` |
| Mercedes | `team-mercedes` | `#27F4D2` |
| Ferrari | `team-ferrari` | `#E8002D` |
| McLaren | `team-mclaren` | `#FF8000` |
| Aston Martin | `team-aston-martin` | `#229971` |
| Alpine | `team-alpine` | `#FF87BC` |
| Williams | `team-williams` | `#64C4FF` |
| RB | `team-rb` | `#6692FF` |
| Sauber | `team-sauber` | `#52E252` |
| Haas | `team-haas` | `#B6BABD` |

---

## Typography

### Font Stack

| Role | Font | Variable | Usage |
|------|------|----------|-------|
| Body | Inter | `--font-inter` | Paragraphs, UI labels, navigation |
| Headings | IBM Plex Sans | `--font-ibm-plex` | Page titles, section headings, card titles |
| Numerics | JetBrains Mono | `--font-jetbrains` | Lap times, positions, deltas, data tables, counters |

### Type Scale

| Level | Size | Weight | Font | Line Height |
|-------|------|--------|------|-------------|
| Caption | 12px / 0.75rem | 400 | Inter | 1.5 |
| Body | 14px / 0.875rem | 400 | Inter | 1.5 |
| Subhead | 16px / 1rem | 500 | IBM Plex Sans | 1.4 |
| H3 | 20px / 1.25rem | 600 | IBM Plex Sans | 1.3 |
| H2 | 24px / 1.5rem | 600 | IBM Plex Sans | 1.2 |
| H1 | 32px / 2rem | 700 | IBM Plex Sans | 1.1 |
| Data (sm) | 16px / 1rem | 500 | JetBrains Mono | 1.2 |
| Data (lg) | 24px / 1.5rem | 600 | JetBrains Mono | 1.1 |

### Rules

- All numeric data uses `font-variant-numeric: tabular-nums` for alignment
- Headings use `letter-spacing: -0.01em` for tighter feel
- Body text max line length: 65-75 characters

---

## Spacing

Base unit: 4px

| Token | Value |
|-------|-------|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |
| `space-16` | 64px |

---

## Elevation Model

**No shadows.** Elevation is communicated through surface color steps and borders.

| Level | Surface | Border |
|-------|---------|--------|
| Base (page) | `f1-dark` | none |
| Raised (card) | `f1-dark-2` | `1px solid f1-grid` |
| Elevated (popover) | `f1-dark-3` | `1px solid f1-grid` |
| Active/selected | `f1-dark-3` | `1px solid f1-red` or team color |

---

## Border & Corner Radius

- **Default radius: 0** (sharp corners — engineering aesthetic)
- Exception: `2px` radius on small interactive elements (buttons, inputs) for anti-aliasing only
- Exception: StatusDot is fully round (`border-radius: 50%`)
- No `rounded-lg`, no `rounded-xl`, no `rounded-full` on cards

---

## Component Specs

### Card

Dark surface with subtle border. Optional team-color left accent.

```
Background: f1-dark-2
Border: 1px solid f1-grid
Border-radius: 0
Padding: 16px (default) | 12px (compact)
Team accent: 2px left border in team color (optional)
Hover: background → f1-dark-3 (100ms ease-out)
```

### StatTile / DataCell

Compact data display: label + value + optional delta.

```
Layout: vertical stack (label on top, value below, delta inline with value)
Label: 12px Inter, f1-muted, uppercase, letter-spacing: 0.05em
Value: 16-24px JetBrains Mono, f1-text, tabular-nums
Delta: 12px JetBrains Mono, f1-green (positive) / f1-red (negative)
Delta prefix: + or - with triangle indicator
Background: transparent (inherits card)
Min-width: 80px
```

### StatusDot

8px circle indicating live/active state.

```
Size: 8px
Shape: circle (border-radius: 50%)
Colors: f1-green (live), f1-red (alert), f1-yellow (caution), f1-muted (offline)
Glow: box-shadow 0 0 6px with color at 60% opacity (active states only)
Animation: pulse (opacity 1 → 0.4 → 1) over 2s, infinite (when live)
```

### ScannerLine

Horizontal animated line for loading/scanning states.

```
Height: 1px
Color: f1-cyan at 80% opacity
Animation: translateX -100% → 100% over 2s, ease-in-out, infinite
Container: overflow hidden, position relative
Gradient: left transparent → f1-cyan → right transparent
```

### NumberCounter

Animated number transitions for data updates.

```
Font: JetBrains Mono, tabular-nums
Animation: 150ms ease-out (Framer Motion animate on value change)
Direction: count up/down from previous value
Decimal precision: configurable (default 0)
```

### TeamColorProvider

React context providing team color by constructor/team ID.

```
Input: team ID string (e.g., "red_bull", "ferrari")
Output: { primary: hex, className: string }
Usage: <TeamColorProvider team="mclaren">{children}</TeamColorProvider>
Access: useTeamColor() hook returns current team color
Fallback: f1-muted when team not found
```

---

## Animation

### Engine Split: GSAP (primary) + Framer Motion (secondary)

| Library | Owns |
|---------|------|
| **GSAP** | DrawSVG circuit outlines, SplitText character reveals, CustomEase counters, Flip layout reordering, ScrollTrigger scroll choreography, complex timelines, MotionPath |
| **Framer Motion** | `AnimatePresence` route exit animations, `whileHover`/`whileTap` micro-states on the `Card` primitive only |

Never use Framer Motion for new complex animations — add them to GSAP timelines.

---

### GSAP Animation System

**Plugin registration:** `frontend/lib/gsap.ts` — always import from here, never directly from `gsap/*`.

```ts
import { gsap, useGSAP, DrawSVGPlugin, SplitText, ScrollTrigger, Flip, CustomEase } from "@/lib/gsap"
```

**Registered plugins:** `DrawSVGPlugin`, `SplitText`, `ScrollTrigger`, `Flip`, `MotionPathPlugin`, `CustomEase`, `useGSAP`

#### Custom Eases (F1 physics metaphors)

| Name | SVG curve | F1 metaphor |
|------|-----------|-------------|
| `pitwall-accel` | `M0,0 C0.05,0 0.133,0.6 0.3,0.8 0.467,1 0.667,1 1,1` | Engine on-throttle — fast start, smooth settle at rev limiter |
| `pitwall-brake` | `M0,0 C0.333,0 0.533,0.4 0.6,0.7 0.733,1 1,1` | Trail braking — gradual start, sharp end into corner |
| `pitwall-pulse` | `M0,0.5 C0.25,0.5 0.4,0 0.5,0 0.6,0 0.75,0.5 1,0.5` | Symmetric pulse for status indicators |

#### useGSAP pattern (mandatory)

Every GSAP animation inside a React component **must** use `useGSAP` with a `scope` ref. This ensures automatic cleanup on unmount.

```ts
const containerRef = useRef<HTMLDivElement>(null)
useGSAP(() => {
  gsap.from(".my-element", { opacity: 0, duration: 0.3, ease: "pitwall-accel" })
}, { scope: containerRef, dependencies: [value] })
```

Never call `gsap.to/from/timeline()` directly inside `useEffect` — memory leaks.

#### Reduced motion

Always check before running animations:

```ts
import { respectsReducedMotion } from "@/lib/gsap"

useGSAP(() => {
  if (respectsReducedMotion()) return   // skip — browser already handles static state
  // ... animation
})
```

Fallbacks by type:
- **SplitReveal**: text visible immediately, no stagger
- **DrawPath**: path drawn immediately at full opacity
- **NumberCounter**: snaps to final value instantly
- **ScannerLine**: stopped via `paused={true}` prop

#### Rules

- **Transforms only** — never animate `width`, `height`, `top`, `left` (causes layout reflow)
- **useGSAP everywhere** — no GSAP calls outside `useGSAP` hooks
- **ScrollTrigger.refresh()** after dynamic content loads that shifts layout
- **Cleanup**: `useGSAP` ctx.revert() handles kills automatically; SplitText must call `split.revert()` in the cleanup return

#### Reusable GSAP primitives

| Component | File | Purpose |
|-----------|------|---------|
| `DrawPath` | `components/ui/draw-path.tsx` | DrawSVG circuit outline animation |
| `SplitReveal` | `components/ui/split-reveal.tsx` | SplitText character/word/line reveal |
| `NumberCounter` | `components/ui/number-counter.tsx` | GSAP pitwall-accel counter |
| `ScannerLine` | `components/ui/scanner-line.tsx` | GSAP timeline scanner (pausable) |

---

### Timing

| Type | Duration | Easing | Notes |
|------|----------|--------|-------|
| Page transition | 200ms | ease-out | Framer Motion AnimatePresence |
| Data update | 150ms | pitwall-accel | GSAP NumberCounter |
| Hover/focus | 100ms | ease-out | CSS / Framer whileHover |
| Scanner line | 1800ms | none (linear) | GSAP timeline, repeat -1 |
| StatusDot pulse | 2000ms | sine.inOut | GSAP, repeat -1 |
| Circuit DrawSVG | 2500ms | pitwall-accel | GSAP DrawSVGPlugin |
| Text reveal | 300ms + stagger | pitwall-accel | GSAP SplitText |

### Page Transition Variant (Framer Motion — unchanged)

```typescript
const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: "easeOut" }
};
```

### Rejected Animation Patterns

- No spring physics (too playful)
- No bounce (too casual)
- No overshoot (too dramatic)
- No stagger delays > 50ms per item (feels slow)
- No GSAP outside `useGSAP` (memory leaks)
- No `width`/`height` animation (layout reflow)

---

## Iconography

- **Library:** Lucide React (already installed)
- **Default size:** 16px (`h-4 w-4`)
- **Sidebar/nav size:** 16px
- **Color:** `currentColor` (inherits text color)
- **Stroke width:** 2 (default)
- No emoji icons, ever

---

## Z-Index Scale

| Layer | Value | Usage |
|-------|-------|-------|
| Base | 0 | Default content |
| Raised | 10 | Sticky headers, floating elements |
| Dropdown | 20 | Dropdowns, popovers |
| Sidebar | 30 | Sidebar navigation |
| Modal overlay | 40 | Modal backdrop |
| Modal | 50 | Modal content |
| Toast | 60 | Toast notifications |

---

## Anti-Patterns (NEVER Use)

- No `rounded-xl` or `rounded-lg` on cards (too soft)
- No gradient backgrounds (flat, functional)
- No spring/bounce animations (too playful)
- No glassmorphism / backdrop-blur (too trendy)
- No shadows for elevation (use border + surface steps)
- No emoji icons (use Lucide SVG)
- No light mode (dark only)
- No hover scale transforms on cards (causes layout shift)
- No decorative illustrations (data is the decoration)

---

## Accessibility

- Minimum 4.5:1 contrast ratio for text (WCAG AA)
- `f1-text` (#E5E5E5) on `f1-dark` (#0F0F0F) = 15.3:1 (passes)
- `f1-muted` (#A3A3A3) on `f1-dark` (#0F0F0F) = 8.6:1 (passes)
- Visible focus rings: `outline: 2px solid f1-cyan, outline-offset: 2px`
- `prefers-reduced-motion`: disable all animations, show static states
- Touch targets: minimum 44x44px
- All interactive elements must have `cursor-pointer`

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (Lucide SVG only)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover transitions 100-150ms, no layout shift
- [ ] All numeric data uses JetBrains Mono + tabular-nums
- [ ] Cards have 0 border-radius (sharp corners)
- [ ] No shadows — elevation via surface color + borders
- [ ] Focus states visible (f1-cyan outline)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed sidebar
