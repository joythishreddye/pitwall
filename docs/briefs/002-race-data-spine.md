# 002 · Race data behind the pages, and the automatic after-race refresh

- **Status:** planned. Build Nov 27 to Dec 6, 2026. The homepage's highlights (brief
  [001](001-briefing-homepage.md)) need the replay files by Dec 3. The refresh first runs by itself after Abu Dhabi
  (Dec 6); Qatar (Nov 29) is refreshed by hand.
- **Tracking issue:** #17 (automated post-race data pipeline), milestone P1.

## Goal
Every 2026 race gets the data the briefing homepage and the race page (brief 003) draw on:
- a compact replay file;
- the circuit's outline;
- the weekend's session start times.

And after each race, a refresh runs by itself. It brings in the results and standings, refreshes the engineer's
knowledge (testing it before the swap), and builds the new race's replay file.

## Sources (both CC BY-NC-SA 4.0, credited on the site)
- **OpenF1 (2023 on):** laps, position, intervals, stints, pit, race_control, weather, and location (for the
  outlines).
  - The free tier needs no auth and allows 3 requests a second.
  - It returns 401 to everyone during any live F1 session. Run after sessions end, and retry on 401 with backoff.
- **Jolpica:** results, qualifying, standings, and the schedule (session times). Back off 60 s on a 429.
- **Not FastF1.** It needs an F1 TV login, and F1 blocks cloud IPs (CLAUDE.md). Never use it in CI, in a cloud
  session or on Render.

## The replay file (one per race)
Compact JSON. About 25 KB was enough for a 71-lap race in the mockup, in this shape:

- **Race:** `race`, `circuit`, `date`, `round`, `laps`, `sessionKey` (OpenF1), `lightsOutUtc`, `sources`.
- **`pitLoss`:** the median time lost in the pit lane, and the number of stops it's based on.
- **`drivers[]`:**
  - `code`, `name`, `last`, `team`, `teamId`, `number`;
  - the final `pos`, `grid` and `status`, and `laps` completed;
  - `laptimes[]` in seconds;
  - `stops[]` as `{lap, dur}`;
  - `stints[]` as `[firstLap, lastLap, compound, tyreAgeAtStart]`.
- **`track`:** the outline's points, for this circuit.
- **`rc[]`:** race control events, as `{t, lap, kind, msg}`. `t` is in race seconds from lights out (negative
  before it). The kinds include safety car, virtual safety car, red flag, flags, low grip and rain risk.
- **`weather[]`:** `[t, trackTempC, airTempC, rainfall]` samples.

**Rules:**
- **One clock:** every `t` is in seconds from lights out, so the replay plays at 1× and 2×.
- **Cars sit on the outline by lap progress,** worked out from lap times. That keeps the file small, so no car
  needs location samples.
- **The final order is the official result,** stewards' changes included. Record where the official result
  differs from the order cars crossed the line, so the engineer can call it out.

## Circuit outlines
- **One per circuit on the calendar,** from OpenF1 location data for one clean lap (the mockup used one lap by the
  2025 Las Vegas winner).
  - Simplify each to an SVG path.
  - Mark the start / finish point and the direction of travel.
- **Never mirrored.** OpenF1's y axis points up and the screen's points down. A test checks each outline's
  direction (the sign of its area, on screen) against a list of which circuits run clockwise. Las Vegas and
  Interlagos both run anticlockwise.

## Session times
Race week lists each session's start: practice 1 to 3, sprint qualifying, the sprint, qualifying and the race.
Jolpica's schedule has them.

A new DB column or table is a migration, and Joythish OKs it first. A static file or a cached fetch avoids one.

## Storage (state the choice and the reasons in the PR)
- **Not Postgres.** Supabase Free has 500 MB, and replay time series stay out of it.
- **No Render egress.** Browsers fetch the files without going through the API: Render bills outbound bandwidth
  beyond 5 GB a month and can't cap it.
- **$0:** no new paid service. Ask Joythish before adding any.
- **Options to weigh:**
  - a public Supabase Storage bucket;
  - static files served by Vercel with the frontend.
  
  Check each one's current free-tier limits in its own docs before choosing. Don't assume them.

## The automatic after-race refresh (#17)
- **When:** after each race, once Jolpica has the result. It can lag the flag by hours, so check and retry rather
  than fire once.
- **Steps, in order:**
  1. `seed_database.py --seasons <year> --skip-fastf1`: results and standings.
  2. Build the race's replay file and publish it to the storage.
  3. Regenerate the knowledge, with the eval before the swap (CLAUDE.md's data-update rule). Run
     `eval_rag.py` on the new knowledge, and swap it into production only if the bar passes:
     - no gold question goes from hit to miss in production mode (vector+intent);
     - production-mode hit@5 doesn't drop;
     - an MRR@5 drop is reported to Joythish, not blocking.
     
     Today `ingest_knowledge.py` swaps first and evaluates after, so this step changes it.
  4. Open a pull request with the regenerated docs and the eval results file. Main takes pull requests only.
- **Runner:** GitHub Actions on a schedule. Its free minutes for a public repo are the default choice.
  - The secrets it needs (the Supabase service key, the Groq key and both model ids) are a secrets change.
    Joythish adds them himself, after he OKs it at build time.
  - Any paid runner or cron (a Render cron job, say) needs his OK first.
  - Cache the embedding model between runs. Ingestion embeds locally with sentence-transformers.
- **Merging the refresh PR:** decided at build time by the local session, as every merge is, and recorded in
  the PR. Either it merges itself when CI and the eval bar pass, or it waits for review.
- **Failures:** a failed run fails the workflow, so GitHub emails the owner (as `keepalive.yml` does).

## Acceptance criteria (each one is a check)
1. **pytest, the replay builder:** a small recorded OpenF1 and Jolpica fixture (a few laps, checked in under
   `backend/tests/`) becomes the expected replay file. That includes positions, gaps, stints, pit laps, race
   control events, and a final order with a stewards' change.
2. **pytest, the outlines:** each fixture outline runs in its circuit's real direction on screen, and its
   start / finish point lies inside the outline's bounds.
3. **pytest, the swap guard:** when the mocked eval results have one production-mode question going from hit to
   miss, the refresh doesn't swap and exits non-zero. When they pass, it swaps.
4. **The 2026 files exist:**
   - a replay file for every 2026 race with results, and an outline for every 2026 circuit, in the chosen
     storage;
   - a check script fetches each one and validates its shape.
5. **A dry run on a past race** (round 20, Brazil) runs the workflow end to end on a branch, with the swap and
   the PR turned off by a flag, and prints what it would have changed.
6. **No Render egress for the files:** the e2e suite asserts that the homepage fetches the replay file from the
   storage's host, not the API's.
7. **The project gates, `floor` and `codex-review` pass.** If the review input passes codex-review's 400 KB cap
   (a full knowledge regeneration can), review it in parts with `--base`.

## Out of scope
- Live data during sessions (January to February).
- Positions-only replays for 1996 to 2022 (the race page, brief 003 or later).
- Predictions.

## Landmines
- **PostgREST caps responses at 1,000 rows.** Page with `.range()` (`fetch_all` in `backend/app/db/supabase.py`).
- **OpenF1's live-session 401 hits scheduled runs too.** A retry that fires while a later session is running gets
  401 until it ends.
- **The repo is public:** keys go in GitHub secrets or env vars, never in files or logs.
- **Cloud sessions push only their own `claude/` branch and never merge** (CLAUDE.md).
