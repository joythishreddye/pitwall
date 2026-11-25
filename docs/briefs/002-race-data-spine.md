# 002 · Race data behind the pages, and the automatic after-race refresh

- **Status:** planned. Build Nov 27 to Dec 6, 2026. The homepage's highlights (brief
  [001](001-briefing-homepage.md)) need the replay files by Dec 3. The refresh first runs by itself after Abu Dhabi
  (Dec 6); Qatar (Nov 29) is refreshed by hand.
- **Tracking issue:** #17 (automated post-race data pipeline), milestone P1.

## Goal
Every 2026 race gets the data the briefing homepage and the race page (brief 003) draw on:
- a compact replay file;
- the circuit's outline;
- the weekend's session start times;
- driver headshot links, fetched between sessions and served with the data, so no page calls OpenF1.

And after each race, a refresh runs by itself. It brings in the results and standings, then refreshes the
engineer's knowledge, testing it before the swap, and publishes the new race's replay file once that test passes.

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
- **The first upload needs Joythish's OK.** Creating a bucket and uploading the 2026 files (criterion 4) is a
  production write with the service-role key, outside the refresh's approval, so he OKs it at the time. Files
  served by Vercel go in through a pull request instead.

## The automatic after-race refresh (#17)
- **Approval:** Joythish approved a refresh that runs by itself and writes production, with its knowledge swap
  gated by the eval bar below (Nov 19, 2026). Turning it on is still his call. He adds the secrets himself, sees
  a dry run's output (criterion 5), and OKs the schedule before the first unattended run. He can turn it off at
  any time (GitHub, Actions, Disable workflow).
- **When:** after each race, once Jolpica has the result. It can lag the flag by hours, so check and retry rather
  than fire once.
- **One run at a time:** a workflow concurrency group makes a later run wait for one still going. A run can back
  off for a long time on a Jolpica 429 or a live-session 401, and two runs must never share the staged set.
- **Steps, in order:**
  1. `seed_database.py --seasons <year> --skip-fastf1`: results and standings. This is the only production write
     before the eval. The knowledge is generated from the database (`generate_all` in `ingest_knowledge.py`), so
     the new knowledge can't exist until the seed has run, and the eval tests the chat's retrieval, not the
     results.
  2. Build the race's replay file. Don't publish it yet.
  3. Regenerate the knowledge and run `eval_rag.py` on it before the swap (CLAUDE.md's data-update rule). The bar:
     - no gold question goes from hit to miss in production mode (vector+intent);
     - production-mode hit@5 doesn't drop;
     - an MRR@5 drop is reported to Joythish, not blocking.

     Production search must never return the new knowledge before the swap, and a run that doesn't swap (a failed
     bar or a dry run) must leave only the old set. Today `ingest_knowledge.py` swaps first and evaluates after,
     and `rag_ingest.py` inserts the new chunks into the live table before deleting the old ones. So this step
     stages the new set, under three rules:
     - **The eval searches exactly the staged set, with production's search logic,** and production chat keeps
       reading the live set by default. Today every read the eval makes goes to the live `knowledge_chunks`
       table: the `match_knowledge_chunks` and `search_knowledge_text` database functions behind `Retriever`
       (`app/rag/retriever.py`), and `EntityLinker.from_db` (`app/rag/entities.py`). Point all three at the
       staged set without copying the search functions, since a copy can drift from the ranking production
       serves. One way: a set column on `knowledge_chunks` that both functions and the linker filter on, with
       the live set as the default.
     - **The swap is one transaction** (one database function, say). Production sees the old set or the new one,
       never a mix, and a failed swap leaves the old set.
     - **A run clears the staged set** when it starts, and when it ends without a swap.

     These changes are a migration, which Joythish OKs first, so ask early in the window.
  4. Only if the bar passes: swap the new knowledge in, then publish the replay file to the storage.
  5. Open a pull request with the regenerated docs and the eval results file. Main takes pull requests only.
     A PR opened with the default `GITHUB_TOKEN` starts no CI runs, so the required checks never report and it
     can't merge. Use a GitHub App token or a fine-grained token that can trigger CI. The PR body and the job
     summary give hit@5 and MRR@5 before and after, and flag an MRR@5 drop: that's how a drop reaches Joythish.
- **Runner:** GitHub Actions on a schedule. Its free minutes for a public repo are the default choice.
  - The secrets it needs (everything `app/config.py` requires at startup: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SECRET_KEY,
    LLM_MODEL and LLM_INTENT_MODEL, plus the Groq key and the PR token) are a secrets change.
    Joythish adds them himself, after he OKs it at build time.
  - Any paid runner or cron (a Render cron job, say) needs his OK first.
  - Cache the embedding and reranker models between runs. Ingestion embeds locally with sentence-transformers,
    and `eval_rag.py` loads bge-reranker-base by default.
- **Merging the refresh PR:** the local session merges it after the gates, like every PR. It never merges itself.
  The merge redeploys Render, since the PR changes `backend/`.
- **Failures:** a failed run fails the workflow, so GitHub emails the owner (as `keepalive.yml` does). After a
  failed bar, production has the new results and standings, the chat keeps the last knowledge that passed, and
  the race has no replay file yet, so the homepage shows its podium without the animation.

## Acceptance criteria (each one is a check)
1. **pytest, the replay builder:** a small recorded OpenF1 and Jolpica fixture (a few laps, checked in under
   `backend/tests/`) becomes the expected replay file. That includes positions, gaps, stints, pit laps, race
   control events, and a final order with a stewards' change.
2. **pytest, the outlines:** each fixture outline runs in its circuit's real direction on screen, and its
   start / finish point lies inside the outline's bounds.
3. **pytest, the swap guard:**
   - When the mocked eval results have one production-mode question going from hit to miss, the refresh doesn't
     swap, doesn't publish the replay file and exits non-zero, and afterwards production search returns none of
     the new set's rows. When they pass, it swaps and publishes.
   - The eval searches the staged set. `FakeKnowledgeBase` in `backend/tests/test_rag.py` answers whatever
     function or set it's asked for today, so extend it to return staged rows only when the staged set is asked
     for. Then a chunk that exists only in the staged set shows up in the eval's results, and neither search
     function nor the entity linker reads the live set.
4. **The 2026 files exist:**
   - a replay file for every 2026 race with results, and an outline for every 2026 circuit, in the chosen
     storage;
   - a check script fetches each one and validates its shape.
5. **A dry run on a past race** (round 20, Brazil) runs the workflow end to end on a branch with a dry-run flag,
   and leaves production as it was: the seed only prints what it would write, the replay file stays a run
   artifact, the new knowledge goes to staging only (the eval's report names the set it searched) and the run
   clears it after the eval, and the PR opens as a draft. It prints what it would have changed. The schedule is
   enabled only after Joythish has seen that output and OK'd it.
6. **No Render egress for the files:** the e2e suite asserts that the homepage fetches the replay file from the
   storage's host, not the API's.
7. **The project gates, `floor` and `codex-review` pass.** If the review input passes codex-review's 400 KB cap
   (a full knowledge regeneration can), review it in parts with `--base`.
8. **The eval passes CLAUDE.md's code-change rule** on the live set before the merge, since this build changes
   retrieval code (`retriever.py`, `entities.py`).

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
- **GitHub turns off a scheduled workflow after 60 days without repo activity** (keepalive.yml notes it). Abu
  Dhabi to the 2027 opener is about three months, so re-enable it before round 1, or keep the repo active.
- **Take lights out from OpenF1's session start, and cross-check Jolpica's date and time.** The stored 2024 Las
  Vegas row is 24 h early.
- **The season is hard-coded:** `CURRENT_SEASON = 2026` in `backend/app/ingestion/generate_knowledge.py`, and
  driver profiles come from that season's results only. Take the season from the data, or update it before the
  2027 opener.
