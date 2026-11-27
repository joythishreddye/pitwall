# 003 · The race page: the engineer's summary, the replay, and the engineer on standby

- **Status:** proposed 2026-11-27 by Claude during the 48h run. **His review pending:** every open call below has
  a recommended option, and the build starts on those. Anything he changes at review gets a follow-up PR.
- **Dates (D16 step 4):** Dec 4 to 20, started early. Part A (the summary and the replay at 1× and 2×) by Dec 11.
  Part B (the engineer answering from the replay's moment) by Dec 20.
- **Tracking issue:** #12 (the replay frontend, P3). A race page issue can open at his review.
- **Sources:** D13 and D14 (`.brain/tasks/002-replan/decisions.md`), mockup v2's race board
  (`.brain/tasks/002-replan/mockup/parts/race-head.html`, `engine-v2.js`, `race-logic.js`), brief
  [002](002-race-data-spine.md) for the replay files.

## Goal
Opening any race (`/races/<id>`) shows, top to bottom:
1. **The engineer's summary:** what happened, in a few one-line calls.
2. **The engineer on standby:** an ask box with TRY ASKING chips.
3. **The replay:** the track map, the timing tower and the race control feed, at 1×, 2× or 30×, with the big
   moments marked on the bar.
4. **The official result and the pit stops,** as the page shows them today.

What a race gets depends on its year (D13):
- **2023 on:** the full replay (tyres, pit stops, flags, weather), from brief 002's files.
- **1996 to 2022:** positions and gaps only. Later, and only if time remains in this build.
- **Before 1996:** results only.
- **Any race without a replay file** shows the summary from its results, and the result table.

## The engineer's summary
- **Made by rules from the data, not by the LLM.** Every fact comes from the replay file or the result.
- **Up to 8 lines.** Each one fits one line at 1440 (52 characters, as in the mockup) and starts with a stamp:
  RESULT, START, L<lap>, AFTER or OUT. Its details are a tap away.
- **The lines, in order, when the data has them:**
  - the winner and where he started ("<Name> wins from pole." or "from 4th on the grid"), then second and
    third;
  - the start: every starter's tyre when they all match, with race control's grip and rain notes;
  - the first cars onto slicks, and a return to intermediates;
  - a stewards' change after the flag (the file's `resultChanges`), with the seconds added;
  - a late start, as at Malaysia 2026 (below);
  - retirements and non-starters.
- **A race without a replay file** gets the result lines and the OUT line only.

## The replay
- **Speeds:** 1×, 2× and 30×. The counter shows the race lap.
- **Clock:** race seconds from lights out (brief 002), so 1× is real time.
- **Map:** the circuit's outline, each car a dot in its team color, placed along the outline by its lap progress
  (from lap times, as brief 002 says). The followed car's dot is larger and labelled.
- **Timing tower:**
  - the header row POS, DRIVER, GAP, TYRE, GAINED (D14);
  - a LEADER / INTERVAL switch for the gap column (D14);
  - tap a row to follow that driver, with a soft wash of his team color behind the row (D14); CLEAR stops it.
- **Big moments on the bar:** LIGHTS OUT, FIRST SLICKS, NEW LEADER, BACK TO INTERS, RAIN, SAFETY CAR, VIRTUAL
  SAFETY CAR, RED FLAG and FLAG. Each is a button that jumps the replay there.
- **Status tags:** the race's state at the moment (ON THE GRID, LOW GRIP, NORMAL GRIP, OVERTAKE ON, OVERTAKE OFF,
  TRACK TEMPERATURE, RAIN, SAFETY CAR, VIRTUAL SAFETY CAR, RED FLAG, CHEQUERED FLAG). Tapping one gets a one-line
  explanation from the engineer, with the mockup's wording (D14). OVERTAKE ON and OFF are 2026's battery boost.
  Recommended for 2023 to 2025: DRS ON and DRS OFF tags from race control's DRS messages instead.
- **Radio feed:** one-line calls as the replay plays (race control, pit stops, lead changes), details a tap away
  (D14). On phones, the tag and time sit on a line above the text, about 41 characters a line (D14).

## The engineer on standby
- **Part A:** the ask box and the TRY ASKING chips: "Who's leading?", "Should <driver> pit now?", "How's <driver>
  doing?", "Who's moving up?" and "What do the columns mean?". The chips are answered in the browser from the
  replay at its current moment, as the mockup does. A typed question goes to the chat with the race named, under
  the chat limits.
- **"Should <driver> pit now?" uses the file's `pitLoss`,** the median time in the pit lane from Jolpica's stop
  durations. That's a few seconds more than a stop really costs (a car on track covers the same stretch in that
  time), so the answer says "a stop here takes about 24 s in the pit lane" and the cars within that gap behind.
  It never names the exact place he'd rejoin.
- **Part B (by Dec 20):** a typed question carries the replay's moment (the lap, the order, the gaps, the tyres)
  to the chat, so the engineer answers about that moment.

## Open calls, with the recommended option
1. **How the replay starts.** Recommended: paused on the grid at 1×, with a play button. The mockup auto-plays
   at 30×, but D13's point was a replay people can watch slowly ("whats the point of replay if someone cant see a
   slowed version?").
2. **Where the page gets the file.** Recommended: from the site itself, `/replays/<season>/<round>.json`
   (brief 002's storage), fetched in the browser. No Render egress, and nothing calls OpenF1.
3. **Knowing which races have a file.** Recommended: each season's `index.json`, which brief 002's build script
   writes beside the files (its rounds and outlines), imported by the page at build time. The page then never
   asks for a file that isn't there, so there's no 404 in the console (verify-outcome fails on console errors).
4. **The chips.** Recommended: answered in the browser from the replay (above). They cost nothing, answer at
   once, and can't spend the day's Groq answers (brief 001's chip landmine). The other option, sending each chip
   to the chat, is slower and spends the shared budget.
5. **The summary.** Recommended: rules, not the LLM. No spend, facts only from the data, and tests can check
   every line.
6. **Phones (390).** Recommended: one column, in the order summary, standby, map with its controls, tower, radio.
7. **The result table.** Recommended: kept below the replay, with its pit stops tab, and fixed at 390 first, in
   its own small PR. Today at 390 it scrolls sideways (571 px wide) and the driver and team columns shrink to
   nothing (found 2026-11-27 on 2024 Bahrain), which the race page's gate would fail.
8. **2023 to 2025 files.** Recommended: the same storage and script as 2026. About 20 KB a race, so about
   1.3 MB for 66 races.

## Race start times: Miami 2026 and Malaysia 2026
- **Miami (round 4) is stored wrong.** Jolpica says 20:00 UTC. The real start was 17:00 UTC: OpenF1's session
  start, and lights out at 17:04 by the lap data. Jolpica and OpenF1 agree on the other 20 races of 2026 (checked
  2026-11-27 against the replay cache).
- **The fix (recommended):** a small overrides file, `backend/app/data/overrides/race_starts.json`:
  `{"2026": {"4": "17:00:00Z"}}`, with a note of its source.
  - The seed applies it where it writes a race's time (`app/ingestion/jolpica_ingest.py`), so every refresh
    keeps 17:00.
  - `scripts/fetch_schedule.py` applies it to the session times file (`backend/app/data/schedule/2026.json`,
    which also says 20:00 today).
  - The replay builder applies it to its stored-start check.
- **Malaysia (round 16) isn't wrong; its start was late.** Jolpica's 07:00 UTC is the scheduled time, and OpenF1
  agrees. Race control suspended the starting procedure at 07:45 UTC and set a new start for 16:33 local time.
  Lights out came at 08:33 UTC, 93 minutes late. No override: the summary's START line says the start was 93
  minutes late. The replay file's `checks.storedStartWrong` flags both races; after the override, only Malaysia.

## Acceptance criteria (each one is a check)
1. **e2e, the page at 1440 and 390,** with the fixture API and a fixture replay file: the summary with the winner
   line from the file, the TRY ASKING chips, the replay with 1×, 2× and 30×, the moments on the bar, and the
   result table.
2. **e2e, speeds:** with Playwright's clock, 1× moves the race clock 10 s in 10 s, and 2× moves it 20 s (both
   within 0.5 s).
3. **e2e, LEADER / INTERVAL:** the switch changes P3's gap to the fixture's interval, and `aria-pressed` follows.
4. **e2e, tags:** tapping a tag shows its explanation, and the close button hides it.
5. **e2e, follow:** tapping a row sets `aria-pressed` and the wash on that row; CLEAR removes both.
6. **e2e, moments:** tapping FLAG moves the clock to the flag, and the tower shows the official order.
7. **e2e, network:** the replay file comes from the page's own origin under `/replays/`. Nothing goes to
   `api.openf1.org`, and a chip sends no chat request.
8. **e2e, a race with no file:** the summary from the result and the table show; no replay section and no console
   error.
9. **Unit tests for the summary and the replay's state at a moment.** These are plain functions under
   `frontend/lib/replay/`. Vitest (planned in CLAUDE.md) comes in its own PR first: a step in the existing
   frontend CI job (a new job would be a check the main ruleset doesn't require), and a line in CLAUDE.md's
   gates.
10. **pytest, start times:** the seed and the schedule script write 17:00 UTC for 2026 round 4 and Jolpica's
    time for every other race; the builder's stored-start check uses the override.
11. **The 2023 to 2025 files** pass `check_replays.py`, like 2026's.
12. **The project gates, floor, verify-outcome with its screenshot judgment, and codex-review pass.** No new
    screenshot baselines without his two OKs: the specs check content and behavior, and the judgment covers the
    look.

## Out of scope
- Positions-only replays for 1996 to 2022, unless time remains.
- Live sessions (January to February).
- Sharing a moment by link (`?t=`).
- Predictions.

## Landmines
- **The fixture API 404s on a path with no fixture,** which fails verify-outcome. The race page's e2e needs
  fixtures for `/api/v1/races/<id>` and its strategy route.
- **verify.json lists only `/`,** so verify-outcome never opens a race page. Add a race route (one with a
  replay file in the fixtures). A route adds screenshots for the judgment, not baselines.
- **Circuits off the 2026 calendar** (Bahrain, Jeddah, Imola and others in 2023 to 2025) need their direction
  in the builder's list, or their outlines go unchecked for mirroring.
- **No second `header` or `aside`** on any page: frontend/e2e/shell.spec.ts takes them unscoped.
- **React Compiler lint:** no refs read during render and no synchronous setState in effects. The replay clock
  runs on `requestAnimationFrame` with refs, and the UI reads it at about 10 updates a second.
- **Reduced motion:** the replay never plays by itself, and the dots jump instead of gliding.
- **Two outlines don't come from their own 2026 race:** Monaco's race has too few position samples (from
  qualifying lap 27), and Hungary's position feed froze for the whole race (from the 2025 race). The file's
  `trackFrom` says where each one came from.
- **The pillar is "Academy",** never "F1 Academy".
