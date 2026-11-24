# Feature briefs

One file per feature, `NNN-<slug>.md`. A brief is merged to main before its build starts, and the build's prompt
names the file. Build exactly what the brief says, and check its acceptance criteria.

| Brief | Feature | Build window |
|---|---|---|
| [001](001-briefing-homepage.md) | The briefing homepage | Nov 27 to Dec 3, 2026 |
| [002](002-race-data-spine.md) | Race data behind the pages, and the automatic after-race refresh | Nov 27 to Dec 6, 2026 |

Next: 003, the race page (the engineer's summary, the engineer on standby, and the replay at 1× and 2× with the
big moments marked), Dec 4 to 20.

Rules for every build:
- Follow `CLAUDE.md` and `.claude/rules/`, and `DESIGN.md` once it exists.
- Cloud sessions push only their own `claude/` branch and never merge. Review and merges happen in the local
  session, after the gates.
- A brief carries no secrets or private notes: the repo is public.
