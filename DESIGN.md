---
name: PitWall
look: pit-wall HUD, dark only
source_of_truth: frontend/app/globals.css (tokens); this file (rules)
colors:
  surface:
    f1-dark: "#0F0F0F"     # page background
    f1-dark-2: "#1A1A1A"   # cards, sidebar, panels
    f1-dark-3: "#252525"   # raised: hover, selected, zebra rows
    f1-grid: "#2B2B2B"     # 1px borders, dividers, grid lines
  text:
    f1-text: "#E5E5E5"     # 15.22:1 on f1-dark, 13.82:1 on f1-dark-2
    f1-muted: "#A3A3A3"    # 7.60:1 on f1-dark, 6.90:1 on f1-dark-2
    f1-red-text: "#FF5C5C" # small red text: 6.33:1 on f1-dark, 5.75:1 on f1-dark-2
  signal:
    f1-red: "#DC0000"      # brand, fills, bars, icons, borders; 3.69:1, never small text
    f1-green: "#00FF00"    # personal best, gaining, positive delta
    f1-yellow: "#FFED00"   # yellow flag, caution
    f1-orange: "#FF6B00"   # safety car, pit stops, warnings
    f1-cyan: "#00C0FF"     # the engineer, data highlights, focus ring
    f1-purple: "#A855F7"   # overall fastest; 4.84:1 on f1-dark, 4.40:1 on f1-dark-2
  position:
    f1-gold: "#FFD700"
    f1-silver: "#C0C0C0"
    f1-bronze: "#CD7F32"
  team:                    # contrast as text on f1-dark-2 in brackets
    red-bull: "#3671C6"    # 3.59, large text only
    mercedes: "#27F4D2"    # 12.40
    ferrari: "#E8002D"     # 3.70, large text only
    mclaren: "#FF8000"     # 6.91
    aston-martin: "#229971" # 4.86
    alpine: "#FF87BC"      # 7.83
    williams: "#64C4FF"    # 9.02
    rb: "#6692FF"          # 5.90
    sauber: "#52E252"      # 10.24
    haas: "#B6BABD"        # 8.91
    audi: "#BB0022"        # 2.60, never text
    cadillac: "#FFFFFF"    # 17.40
typography:
  body: { family: Inter, utility: font-sans, size: 14px, line-height: 1.5 }
  heading: { family: IBM Plex Sans, utility: font-heading, weights: [500, 600, 700], letter-spacing: -0.01em }
  data: { family: JetBrains Mono, utility: font-data, numerals: tabular }
  scale: { label: 11px, caption: 12px, body: 14px, subhead: 16px, h3: 20px, h2: 24px, h1: 32px }
  minimum: 11px
rounded:
  panel: 0                 # cards, tiles, tables, panels
  control: 4px             # rounded-sm: buttons, inputs, chips, badges
  dot: 9999px              # rounded-full: status dots and avatars only
spacing: { base: 4px, scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] }
motion:
  library: GSAP (frontend/lib/gsap.ts), inside useGSAP with a scope ref
  settled_within: 400ms of the content appearing
  hover: 100ms ease-out (CSS)
  eases: [pitwall-accel, pitwall-brake, pitwall-pulse]
breakpoints: { phone: "< 768px", tablet: 768px, desktop: 1440px }
---

# PitWall design

PitWall looks like a race engineer's screen on the pit wall: near-black ground, dense data, monospace numbers,
1px rules and team colour. It isn't a luxury SaaS page. The AI race engineer is the star and the visuals support
it. When in doubt, ask "would this look at home on a Mercedes pit wall monitor?"

This file is the one design source. `frontend/design-system/MASTER.md` and `.claude/rules/design.md` point here.
Tokens live in `frontend/app/globals.css` (`@theme`); use the Tailwind classes (`bg-f1-dark-2`,
`text-f1-muted`), never raw hex in components. Team colours come from `lib/constants/teams.ts`.

## Do
- **Data over decoration.** Every colour has a data meaning (the tokens above). Density beats whitespace.
- **Numbers in `font-data`** (JetBrains Mono, tabular): lap times, positions, points, gaps, speeds, counts, and
  small uppercase labels and eyebrows. Names, prose and nav items use Inter (the phone tab bar is the one
  exception; see The shell); headings use IBM Plex Sans.
- **Formats:** lap times to 3 decimals (`1:23.456`), gaps and deltas with a sign (`+0.123`), points as integers
  (`402`), positions as `P1`.
- **Elevation by surface step and border,** never shadows: page `f1-dark`, card `f1-dark-2` with a 1px `f1-grid`
  border, raised or selected `f1-dark-3`, active with a 1px or 2px red or team-colour accent.
- **Team colour wherever a driver or team appears,** and beyond thin bars: a left accent bar on rows, and a
  team-colour gradient on driver and team face tiles. Team colour as text only where it passes: Red Bull and Ferrari
  only as large text (24px, or 18.66px bold); Audi never as text. Otherwise the number stays `f1-text` and the
  team colour goes on a bar, a dot or the tile.
- **Small red text uses `text-f1-red-text`** (#FF5C5C). `f1-red` (#DC0000) is for fills, bars, icons and borders.
- **Timing colours follow the broadcast:** purple is the overall fastest, green a personal best, yellow a flag or
  caution. Purple text sits on `f1-dark` only; on a card it's a purple badge with `f1-dark` text.
- **Deltas and positions:** green when gaining, `f1-red-text` when losing, with a sign or a triangle.
- **Tyres:** red soft, yellow medium, white hard, green intermediate, blue wet, as dots or badges.
- **Tables:** sticky header, zebra rows (`f1-dark-2` / `f1-dark-3`), compact rows (40 to 48px), leader emphasis.
- **Empty and error states say why and what's coming,** never just "No data".
- **The engineer says only what the data shows.** No guessed reasons, no hype. If the data can't answer, say so.
- **Accessibility:** text at least 4.5:1 (3:1 for large text), visible focus (`2px` cyan outline, `2px` offset),
  touch targets at least 44px on coarse pointers, `cursor-pointer` on everything clickable, and
  `prefers-reduced-motion` respected (`respectsReducedMotion()` in `lib/gsap.ts`; the CSS rule in globals.css
  stops CSS animations).

## Don't
- **No text under 11px,** anywhere, at 1440, 768 or 390.
- **No LIVE label or pulsing live dot outside a session.** "LIVE" means an F1 session is running now, from the
  session times. Outside one, show the next session or nothing.
- **No text still fading in or counting up 400ms after it appears.** Entrances (stagger included) finish within
  300ms; counters show the value on load and animate only when the value changes (150ms). The UI check reads
  contrast 400ms after load, and half-faded text fails it.
- No corner radius on panels; `rounded-sm` at most on small controls; `rounded-full` only for dots and avatars.
- No shadows for elevation, no glassmorphism or `backdrop-blur`, no decorative gradients (team-colour face tiles
  and the photo fade into `f1-dark-2` are the exceptions), no carbon-fibre texture, no speed lines.
- No spring, bounce or overshoot; no hover scale on cards; never animate `width`, `height`, `top` or `left`.
- No hero sections, splash screens or marketing copy; no emoji icons (Lucide, 16px, `currentColor`); no light mode.
- No decorative text that fails contrast (for example a big faded driver code as a watermark).
- No official F1 or FIA branding; the pillar is "Academy", never "F1 Academy".

## Motion
- **GSAP is the only animation library in use.** Import from `@/lib/gsap`; call it only inside
  `useGSAP(() => {...}, { scope: ref })`. Eases: `pitwall-accel` (entrance), `pitwall-brake` (exit),
  `pitwall-pulse` (status).
- Durations: entrance 300ms, hover and focus 100ms (CSS), data update 150ms, a circuit outline drawing in 1.8 to
  3.5s (a line, not text). Stagger at most 50ms per item.
- **Motion (`motion/react`) is installed but unused.** `components/providers.tsx` wraps the app in `LazyMotion`;
  nothing renders an `m.*` component, `PageTransition` isn't rendered, and nothing provides `AnimatePresence`.
  Card's hover is CSS (`components/ui/card.tsx`). Don't add page transitions or `whileHover` with it; new motion
  goes in GSAP.

## The shell
- **Desktop and tablet (768px and up):** a fixed 224px sidebar (`components/sidebar.tsx`) with the wordmark,
  8 nav items and a season line, and a 40px breadcrumb top bar (`components/topbar.tsx`) with a solid background.
- **Phone (under 768px):** a bottom tab bar with 5 items (Home, Standings, Races, Drivers, Chat); the sidebar is
  hidden. Predictions, Live and Academy aren't on it yet.
- The active item: red icon, a 2px red bar and a small static red dot (6px, `f1-red`, never pulsing) at the end
  of the row on desktop; `f1-red-text` label on the phone tab bar.
- Type: the wordmark in IBM Plex Sans, the sidebar's nav rows in Inter (14px), and the small labels in
  `font-data`: the tagline, NAVIGATION, the season and version lines (11px), the breadcrumb (12px, in capitals)
  and the phone tab bar's labels (11px). The tab bar is the one nav in mono, as in the approved screenshots.

## Checks
- `verify.json` (repo root) runs the UI check on every change under `frontend/`: the production build against the
  local fixture API (`pnpm build:e2e`, `e2e/serve.mjs`), the e2e suite with its screenshot baselines at 1440, 768
  and 390, then overflow, contrast, fonts, console errors and reduced motion on each route in `routes`.
- The e2e suite and the check never reach the production API, the chat or OpenF1: the e2e build points both at
  `e2e/fixture-api.mjs`, which serves saved JSON from `e2e/fixtures/` and answers 404 to anything else.

## Known departures (pages not yet brought up to this file)
Dated Nov 25, 2026, updated Nov 26. Each page is brought up to this file when it's rebuilt or added to
`verify.json`'s routes.
- Page titles (h1) are 24px (`text-2xl`; 20px on the error page, 14px in Chat). None uses the scale's 32px.
- The shell and the footer, on every page: the active item's red bar slides by animating `top` (250ms); touch
  targets under 44px (the sidebar's nav rows, about 36px, which tablets get; the breadcrumb's links, about 16px;
  the footer's credit links, about 18px); and a 150ms hover on the footer's links.
- Standings, Races, a race, Drivers, a driver, Chat, Predictions, Live, Academy, Dashboard (`/dashboard`, not in
  the nav), the error, loading and 404 pages: 77 texts under 11px in 17 files, small `text-f1-red` text, faded
  `text-f1-muted/NN` text, `rounded-sm` on some panels, fade-ins longer than 300ms, `box-shadow` glows, a LIVE
  label with a pinging dot on Live while no session is running, and pulsing live dots in Chat.
- The chart and the number counter are shared with the homepage and changed with it: the Standings chart draws
  in 300ms with 11px axis labels (labels that would overlap are dropped), and the driver stat tiles no longer
  count up on load. Still open in both: a changed value counts for 0.8 to 1.05s, not 150ms; the chart's legend
  toggles are about 17px tall, under the 44px touch target, and its legend swatches glow (`box-shadow`).
- The homepage was brought up to this file on Nov 25 only as far as the UI check needs (its tiles and chart
  settle at once, no watermark, a team-colour wash when there's no photo, readable numbers, 11px labels, no
  pulsing RACE DAY dot). Left as is until the briefing homepage (`docs/briefs/001-briefing-homepage.md`)
  replaces the page from Nov 27:
  - the chart's totals leave out sprints (402 points on the leader tile, 371 on the chart), a data gap;
  - below 1024px the top-5 strip scrolls sideways with no cue that the last drivers are off to the right (P4
    and P5 at 768, P3 to P5 on phones), and at 768 and 390 the Recent Results row is cut off at the tile's edge
    (the third race at 768; on phones only the latest race shows in full);
  - on phones the leader tile's "CHAMPIONSHIP LEADER" label sits right on the P1 badge, with no gap;
  - the six tile labels ("CHAMPIONSHIP LEADER", "NEXT RACE" and the rest) are in Inter, not `font-data`, and
    most driver, team and race names are in IBM Plex Sans, not Inter;
  - colours outside their meanings (green is a gain or a personal best, cyan the engineer, data highlights or
    focus): `f1-green` on the Next Race calendar icon and its RACE DAY label and dot; `f1-cyan` on the Next Race
    track outline, the Constructor Leader trend icon and the chart's View Full link;
  - the leader tiles show the points in the team colour, and the drivers' tile shows its P1 badge as dark text
    on the team colour: fine with today's leader (Mercedes), but the badge falls under 4.5:1 with a Red Bull
    (4.0), Ferrari (4.1) or Audi (2.9) leader, and Audi points would break "Audi never as text";
  - the View Full link is about 16px tall, under the 44px touch target;
  - glows (`box-shadow`) on the RACE DAY dot and on the leader tile's hover;
  - when the API can't be reached, its notice is a `rounded-sm` panel with a retry button under 44px tall and a
    150ms hover; a race with no result says only "No result".
