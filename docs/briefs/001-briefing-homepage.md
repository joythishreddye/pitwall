# 001 · The briefing homepage

- **Status:** design approved (mockup v2, Joythish's OK on 2026-11-24). Build Nov 27 to Dec 3, 2026.
- **Tracking issue:** #38
- **Depends on:** `DESIGN.md` (lands Nov 26), the e2e suite and `verify.json` (same day), and brief
  [002](002-race-data-spine.md) for circuit outlines, replay files and session times. The race-week and off-season
  views can be built before 002 lands. The after-race highlights can't.

## Goal
The homepage becomes the AI race engineer's briefing: a short radio briefing on F1 right now, beside one big
picture that changes with the calendar, with the ask box below. It works all year and keeps the engineer the star.
It's for F1 fans, from newcomers to hardcore.

## Read first
- `CLAUDE.md`, `.claude/rules/frontend.md`, `.claude/rules/design.md` (replaced by `DESIGN.md` on Nov 26; follow
  `DESIGN.md` once it exists).
- Code to reuse:
  - `components/ui/draw-path.tsx`: the track drawing in.
  - `components/championship-chart.tsx`: the title fight.
  - `lib/hooks/use-countdown.ts`.
  - `lib/hooks/use-chat.ts` and `components/chat/*`: the ask box.
  - `components/ui/team-color-provider.tsx` and `lib/constants/teams.ts`.
  - `lib/hooks/use-driver-photos.ts`: headshots, falling back to the driver code. It calls OpenF1 from the
    browser, so switch to brief 002's headshot links once they land.
  - `lib/hooks/use-standings.ts` and `lib/hooks/use-races.ts`.
- `components/home/*` holds today's homepage tiles. The new page replaces them; keep only what fits.

## Layout
At 1440 (1360 px and wider): a grid with columns `520px minmax(0, 1fr)` and areas `"brief pic" / "ask pic"`. Main
content is at most 1400 px wide.

```
+---------+------------------------------------------------------------------+
| PITWALL | RACE WEEK · ROUND 22 OF 23          (eyebrow, mono, 11 px)       |
| nav     | Qatar Grand Prix                    (h1, one meta line below)     |
|         | +-- ENGINEER'S BRIEFING (520) --+ +-- THE BIG PICTURE ----------+ |
|         | | Radio check. I'm your AI ...  | | title             [badge]   | |
|         | | [faces] TAG                + | | race week: outline drawing   | |
|         | |         one-line call        | |   in, START / FINISH,         | |
|         | | [icon]  TAG                + | |   LIGHTS OUT IN 3d 21h ...    | |
|         | |         one-line call        | | after a race: highlights,     | |
|         | | ... 4 to 6 lines             | |   WATCH THE FULL REPLAY       | |
|         | +------------------------------+ | off-season: the title fight   | |
|         | +-- ASK THE ENGINEER -----------+ |                              | |
|         | | TRY ASKING: 4 chips           | |                              | |
|         | | answers (last 4) + input      | |                              | |
|         | +------------------------------+ +------------------------------+ |
+---------+------------------------------------------------------------------+
```

Below 1360 px it's one column, in the order brief, picture, ask (the picture's content at most 760 px wide).
Below 768 px the page padding is 16 px.

**The site's shell doesn't change in this build:** `components/sidebar.tsx` (with its phone tab bar),
`components/topbar.tsx` and the footer stay as they are. The layout and look rules here cover the homepage's own
content. The mockup's phone header stood in for the shell, and the DESIGN.md work owns any change to it.

```
+-------------------------------+
| RACE WEEK · ROUND 22 OF 23    |
| Qatar Grand Prix              |
| ENGINEER'S BRIEFING           |
| [faces] TAG · time            |
| one-line call, may wrap    +  |
| ...                           |
| THE BIG PICTURE               |
| ASK THE ENGINEER              |
+-------------------------------+
```

**The picture panel fills its column (from Joythish's review of the mockup).** At 1440 the picture grows to the full height of
its column, with no empty panel under its content. He judges this one in the screenshots.

## The three views
The clock picks the view. All times are in the visitor's time zone, with its abbreviation; the e2e suite runs in
`America/Los_Angeles`.

- **After a race:** for 72 hours from the scheduled start of the latest race that has results in PitWall's data
  (at exactly 72 hours the next view takes over).
- **Race week:** otherwise, for the first race without results, once its season is under way (an earlier race of
  that season has results) or the race starts in 14 days or less (at exactly 14 days, race week takes over).
  - Before lights out: a countdown to the race start.
  - From the start until 2 h 30 after it, the picture says RACE UNDER WAY. After that it says RESULTS SOON, until
    the data has the result.
  - The LIVE dot (pulsing green) shows only between a session's start and its scheduled end. Jolpica gives start
    times only, so a session ends at its start plus its standard length: 1 h for practice, qualifying and the
    sprint, 45 min for sprint qualifying, 2 h for the race.
- **Off-season:** otherwise. The season is complete, the after-race window has ended, and the next season's first
  race is more than 14 days away or not in the data yet.

Fixed-clock examples, for tests on fixture data (race starts: Brazil 2026-11-08T17:00Z, Las Vegas
2026-11-22T04:00Z, Qatar 2026-11-29T16:00Z, Abu Dhabi 2026-12-06T13:00Z, and in the last two rows a made-up 2027
round 1 at 2027-03-07T04:00Z):

| Clock (UTC) | Data | View |
|---|---|---|
| 2026-11-24T19:00Z | rounds 1–21 have results | after a race, Las Vegas (until 2026-11-25T04:00Z) |
| 2026-11-25T19:00Z | rounds 1–21 have results | race week, Qatar: LIGHTS OUT IN 3 days 21 h |
| 2026-11-24T19:00Z | rounds 1–20 only (Vegas missing) | race week, Las Vegas: RESULTS SOON |
| 2026-11-29T20:00Z | Qatar's result in | after a race, Qatar |
| 2026-12-02T16:00Z | Qatar's result in | race week, Abu Dhabi |
| 2026-12-06T18:00Z | Abu Dhabi's result in | after a race, Abu Dhabi |
| 2026-12-09T13:00Z | season complete, no 2027 dates | off-season |
| 2027-02-20T04:00Z | 2026 complete, 2027 round 1 in the data | off-season (round 1 is 15 days away) |
| 2027-02-22T04:00Z | 2026 complete, 2027 round 1 in the data | race week, 2027 round 1: LIGHTS OUT IN 13 days 0 h |

## The engineer's briefing
- **Built by rules from the data,** with no LLM call on page load. Put the rules in the backend, behind one
  endpoint (for example `GET /api/v1/briefing`), so pytest covers them and the page makes one request. The
  frontend only renders the lines.
- **The engineer says only what the data shows:**
  - conditions come from race control's messages, the weather station and tyre choices, never from lap times
    alone;
  - a result the stewards changed after the race is called out.
- **The intro line:** "Radio check. I'm your AI race engineer: here's where Formula 1 stands right now. Tap a line
  for details, or ask me anything."
- **Each line has:**
  - a TAG;
  - a one-line call of at most 52 characters, so it fits one line in the 520 px column at 1440. Each call has
    shorter fallbacks, and the first one that fits wins;
  - a detail a tap away (a button with `aria-expanded`);
  - up to two driver faces (a team-colour tile with the headshot and the code) or an icon.
- **The calls type in.** The status reads TRANSMITTING while they type, then TAP A LINE FOR DETAILS. With reduced
  motion there's no typing.
- **Title maths:** points left at most = remaining races × 25 + remaining sprints × 8 (drivers), and remaining
  races × 43 + remaining sprints × 15 (constructors). A title is decided when the lead is bigger than the points
  left. "Can still finish second" means within the points left of second place.

The lines in each view (from the approved mockup; the wording can tighten, the facts can't change):

| View | Lines, in order |
|---|---|
| Race week | RACE WEEK ("Race week: Lusail, round 22 of 23."; detail: the circuit, the first session, qualifying, lights out) · TITLE ("Antonelli is champion: N points clear." once decided, else "X leads by N, with M left.") · SECOND PLACE (when two or more can still finish second) · TEAMS (when the constructors' title is decided) · LAST YEAR (last year's winner at this circuit and his grid slot; detail: the podium and the pole) |
| After a race | RESULT × 3 (winner and his grid slot; second, plus his championship position when it's P2; third, or "two Mercedes on the podium") · TITLE (when decided, with the points he scored in this race) · NEXT RACE (where and when; detail: the round and the races after it) |
| Off-season | CHAMPION · SECOND PLACE · TEAMS · REPLAYS (only once race-page replays exist: brief 003) · NEXT SEASON (round 1's date when it's in the data, else "No 2027 dates yet.") |

**TRY ASKING chips** (four per view; tapping one sends it):
- **Race week:** When does the race start? · Can anyone catch {leader}? · Who's fighting for second? · Who won here
  last year?
- **After a race:** Who won in {race}? · How did {P2} get to second? · one question about the race's biggest moment
  (rain, a safety car, a red flag), only when the data has one · When's the next race?
- **Off-season:** How did {champion} win it? · Who's second overall? · Who won the teams' title? · When does {next
  season} start?

## The big picture
- **Race week:**
  - the next circuit's outline drawing in (reduced motion: drawn at once), with a START / FINISH marker inside
    the frame;
  - LIGHTS OUT IN with days, hours, minutes and seconds, then the race's date and time;
  - THIS WEEKEND: each session with its day and time, tagged DONE or NEXT.
- **After a race:**
  - the race's highlights on the track map at 60×: team-colour dots, the top three labelled, a lap counter, the
    top five with their gap to the leader, and the engineer's caption for the latest moment;
  - pause and play. At the flag it holds the result for 4 seconds, then restarts. With reduced motion it opens
    paused on the result;
  - WATCH THE FULL REPLAY, linking to the race page (`/races/[id]`).
  - It needs brief 002's replay file for that race. Without one, show the podium and the result, with no
    animation.
- **Off-season:**
  - the title fight: the top five's points after each round, drawing in over about 2.4 s, with end labels
    ("ANT 390");
  - pointing at the chart or tapping it shows AFTER ROUND N with each driver's points, and leaving clears it;
  - a legend below the chart.

## The ask box
- Answers come from the existing chat endpoint (`POST /api/v1/chat` through `use-chat`).
- The thread keeps the last 4 questions and answers, at most 280 px high, newest at the bottom.
- It's the only place the homepage calls the LLM, and only when someone asks.

## Look (until DESIGN.md lands, then DESIGN.md wins)
- **The pit-wall look:** a `#0F0F0F` background; Inter for body text, IBM Plex Sans for headings, JetBrains Mono
  (tabular numbers) for labels and figures.
- **No text under 11 px** in the page's content at 1440, 768 or 390 (the shell's 10 px labels belong to the
  DESIGN.md work).
- **Small red text uses `#FF5C5C`.** The site's `#DC0000` is 3.7:1 on `#0F0F0F`.
- **Team colour goes beyond thin bars:** the face tiles use a team-colour gradient.
- **On phones,** the tag and time sit above the call, not beside it.
- **Touch targets** are at least 44 px on coarse pointers.
- **A failed driver photo** shows the code on team colour, never a broken-image icon.

## Data
- **Exists:**
  - `/api/v1/standings/{year}`: drivers and constructors.
  - `/api/v1/standings/{year}/progression`: points after each round.
  - `/api/v1/seasons/{year}/races`: the calendar, with each race's start and winner.
  - `/api/v1/races/{id}`: results, with grid slots.
  - `/api/v1/chat`.
- **From brief 002:** circuit outlines, replay files, and session start times.
- **Last year's race at this circuit:** the same circuit's race in the previous season, from the results data.
- **Sprint weekends** among the remaining races, for the title maths.
- **A new DB column or table is a migration,** and Joythish OKs it first. A static file or a cached fetch avoids
  one.

## Acceptance criteria (each one is a check)
1. **pytest, on fixture data, for each view:**
   - every call is at most 52 characters;
   - no line contains "undefined", "NaN" or "None";
   - the title maths is right for a decided and an undecided fixture;
   - the view is right at each fixed-clock example above.
2. **The e2e suite (Playwright, mocked API, fixed clock):**
   - the page shows the right view and countdown at three of the examples;
   - a line opens and closes;
   - a chip sends exactly one (mocked) chat request;
   - no request goes to `/api/v1/chat` on page load.
3. **`verify-outcome` passes** at 1440, 768 and 390 (overflow, contrast, fonts, console errors, reduced motion),
   and its screenshot judgment says PASS.
4. **The project gates, `floor` and `codex-review` pass.**
5. **Before the merge, Joythish sees the three views** in screenshots and OKs the look.

## Out of scope
- The race page and its replay (brief 003, Dec 4 to 20).
- "Your pit wall" (saved preferences).
- Live data during sessions (January to February).

## Landmines
- **OpenF1 returns 401 to everyone during a live F1 session.** Never fetch it when a page is viewed. The one
  exception today is the headshot lookup (`use-driver-photos.ts`, with its code fallback, per CLAUDE.md), and
  brief 002 moves headshots server-side.
- **A race's start is its date plus its time, in UTC, but check night races.** The stored 2024 Las Vegas race
  reads 2024-11-23 06:00, 24 h before its real start (2024-11-24T06:00Z). 2025 and 2026 are right. Test the views
  against a night race.
- **`verify-outcome` loads pages live, not through the e2e mocks.** So the page must not call the chat on load,
  and it must render without errors on live data.
- **Don't port the mockup's code.** It ran on another runtime, with a mock clock. This brief is the spec.
- **The repo is public:** no secrets, keys or private notes in code, tests or briefs.
- **Cloud sessions push only their own `claude/` branch and never merge** (CLAUDE.md).
