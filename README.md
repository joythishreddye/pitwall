# PitWall

> An AI race engineer for every Formula 1 fan. Unofficial fan project.

[![CI](https://github.com/joythishreddye/pitwall/actions/workflows/ci.yml/badge.svg)](https://github.com/joythishreddye/pitwall/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)](https://claude.com/claude-code)

In F1, the pit wall is where race engineers read the data and call the strategy. PitWall puts that seat in your browser: ask the race engineer anything, from "what is an undercut?" to "why are Mercedes so fast this year?", in an interface built like a team's timing screens.

**Live:** [pitwall-teal.vercel.app](https://pitwall-teal.vercel.app)

## What works today

### Race Engineer chat
Answers come from a retrieval pipeline over 238 knowledge documents (1,128 chunks): driver, team and race reports for 2018–2026, the 2026 regulations, and explainers.

1. **Intent:** `gpt-oss-20b` pulls out the drivers, teams, circuits and seasons a question is about, in JSON mode.
2. **Entity linking:** a deterministic linker maps those names to the refs the knowledge base uses ("Lando Norris" becomes `norris`, "Singapore" becomes `marina_bay`). It also catches names the model missed and builds the metadata filter.
3. **Search:** pgvector cosine search over BGE-base-en-v1.5 embeddings, plus a targeted search for each named driver or team, so comparisons get both sides.
4. **Answer:** `gpt-oss-120b` on Groq streams the reply over Server-Sent Events, with the latest standings injected as context.

The pipeline degrades instead of failing. Without embeddings (an outage, or the monthly spend ceiling reached), it falls back to Postgres full-text search with the same filters.

### Retrieval quality, measured
`python scripts/eval_rag.py` scores retrieval against a 55-question gold set (`backend/evals/rag_gold.json`) covering drivers, teams, races, circuits, rules, history and head-to-head comparisons. A question counts as a hit when a document holding its answer lands in the top 5. Every row below comes from one run and is scored on the same classifier outputs.

| Pipeline | hit@5 | MRR@5 |
|---|---|---|
| Vector search alone | 60.0% | 0.57 |
| + the classifier's filters, used as-is | 81.8% | 0.70 |
| + entity linking (production) | **100%** | **0.91** |
| + cross-encoder reranking | 98.2% | 0.75 |
| Full-text fallback (no embeddings), linked filters | 87.3% | 0.81 |

Entity linking adds 18 points of hit@5 over the classifier's own filters. Reranking lost one question and ranked the rest worse, and added about 0.8s per question on a laptop CPU, so it ships switched off (`RERANK_ENABLED`).

Caveats:
- The gold set is small and hand-written, and the linker was built against its failures.
- Three questions that matched the classifier's own prompt examples were paraphrased.
- False-positive cases (a word like "stroll" or "China" turning into a filter) are covered by unit tests, not by the eval.

A held-out question set is next.

### Season data
Standings, results, qualifying and driver profiles for 2018–2026, with lap times, tyre stints and pit stops from 2022. Ingested from Jolpica and FastF1 into Supabase Postgres and served by FastAPI.

### Pit-wall interface
Next.js 16 and GSAP: circuit outlines that draw themselves, chat shown as radio transmissions, a race-control home dashboard, team-color accents throughout.

## Engineering notes

- **Swappable LLMs:** routes depend on a provider interface, never on an SDK. When Groq retired Llama 3.3 70B, moving to gpt-oss was a config change (`LLM_MODEL`, `LLM_INTENT_MODEL`).
- **Readiness, not just liveness:** `GET /health/ready` checks the database, both models and the embedding service. A twice-daily GitHub Actions job keeps the free database awake and emails on outages.
- **Spend guardrails:**
  - Paid inference calls go through a monthly ceiling counted in Postgres, which fails closed.
  - Chat has per-client and global rate limits.
  - The API caps its own daily response bandwidth, so hosting costs can't run past the plan.
- **Evals gate retrieval changes:** every retrieval change is scored against the gold set above. That's how the linker went in and the reranker came out.
- **Tests and CI:** 163 backend tests (pytest). Every push runs ruff, pytest, ESLint, TypeScript and a production build.

## Roadmap

| Phase | Target | What ships |
|---|---|---|
| Data spine v2 | Nov 2026 | OpenF1 ingestion, an automated post-race pipeline, pace and time-loss analytics |
| Predictions | Nov 2026 | Race predictions logged publicly before each session and scored after, with a championship simulator |
| Live | Dec 2026 | Replay any recent session "as if live": track map, timing tower, AI insights |
| Race Engineer agent | Dec 2026 | Tool-calling agent: "why" answers built from time-loss data, simulated what-ifs, rulebook search |
| Academy | Jan 2027 | A learning path for new fans: lessons that replay real race moments, quizzes, streaks |
| Launch | Feb 2027 | Polish, mobile and accessibility, ready for the 2027 season |

## Architecture

```
Browser ── Next.js 16 on Vercel
              │  HTTPS + Server-Sent Events
              ▼
         FastAPI on Render ──── Groq (gpt-oss-120b answers, gpt-oss-20b intent)
              │           └──── HuggingFace (BGE query embeddings)
              ▼
     Supabase Postgres + pgvector ◄── ingestion: Jolpica, FastF1 (OpenF1 next)
```

## Run it locally

Prerequisites: Node.js 20.9+, pnpm 10, Python 3.12, a Supabase project, and a Groq API key.

```bash
git clone https://github.com/joythishreddye/pitwall.git
cd pitwall

# Backend
cd backend
python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # fill in your keys
uvicorn app.main:app --reload     # http://localhost:8000/docs

# Frontend (new terminal)
cd frontend
pnpm install
pnpm dev                          # http://localhost:3000
```

Database migrations live in `supabase/migrations/`. Seed data with `python scripts/seed_database.py --skip-fastf1`, then build the knowledge base with `python scripts/ingest_knowledge.py`.

## Data, credits and licenses

- Results and standings: [Jolpica F1](https://github.com/jolpica/jolpica-f1) (CC BY-NC-SA 4.0)
- Timing data: [FastF1](https://github.com/theOehrly/Fast-F1) and [OpenF1](https://openf1.org) (CC BY-NC-SA 4.0)
- Circuit outlines: julesr0y/f1-circuits-svg (CC BY 4.0)
- Driver photos: © Formula 1, linked, not redistributed

The code is MIT-licensed ([LICENSE](LICENSE)). The data and the generated knowledge documents follow their sources' terms ([DATA_LICENSE.md](DATA_LICENSE.md)), so PitWall stays non-commercial.

PitWall is not associated in any way with the Formula 1 companies. F1, FORMULA ONE, FORMULA 1, GRAND PRIX and related marks are trademarks of Formula One Licensing B.V.

## Author

**Joythish Reddy Evuri**: [LinkedIn](https://www.linkedin.com/in/joythishreddy/) · [GitHub](https://github.com/joythishreddye)
