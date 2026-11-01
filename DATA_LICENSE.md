# Data and content licensing

PitWall's **source code** is MIT-licensed (see [LICENSE](LICENSE)). The **race data** it serves, and the knowledge-base documents generated from that data in `backend/knowledge/`, are not. They come from the sources below under those sources' own terms.

| Source | What PitWall uses | License |
|---|---|---|
| [Jolpica F1 API](https://github.com/jolpica/jolpica-f1) | Schedules, results, qualifying, standings | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) ([terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)) |
| [OpenF1](https://openf1.org) | Laps, stints, pit stops, weather, race control (from Phase 1) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| [FastF1](https://github.com/theOehrly/Fast-F1) | Timing data loaded before October 2026 | Library: MIT. Data: Formula 1's timing service |
| julesr0y/f1-circuits-svg | Circuit outlines in `frontend/lib/constants/circuits.ts` | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (the source repository is no longer online) |
| Formula 1 | Driver headshots, linked from Formula 1's media servers and never copied into this repository | © Formula One World Championship Limited |

## What this means

- **PitWall is non-commercial.** No ads, no paid tier, and no sale of data.
- **Generated knowledge documents are shared alike.** The Markdown files in `backend/knowledge/` (driver, team and race summaries) are adaptations of CC BY-NC-SA data, so they are shared under CC BY-NC-SA 4.0.
- **Credit goes to the sources** in the app's footer and in the README.

## Trademarks

PitWall is an unofficial fan project. It is not associated in any way with the Formula 1 companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trademarks of Formula One Licensing B.V.
