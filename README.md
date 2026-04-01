# PitWall — Your AI Race Engineer

> An AI-powered Formula 1 intelligence platform that makes the sport accessible to newcomers while providing depth for hardcore fans.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)](https://claude.com/claude-code)

In F1, the **pit wall** is where race engineers sit and feed real-time strategy to drivers. PitWall puts an AI race engineer in your pocket.

## Features

### AI Race Companion
Chat with an AI that knows all of F1 — rules, history, teams, rivalries, and strategy. Adapts to your knowledge level, from complete beginner to hardcore fan.

### Predictive Intelligence
ML-powered race and qualifying predictions with explainable AI. Monte Carlo championship simulations and "What If" strategy analysis.

### Live Race Dashboard
Real-time position tracking, gap analysis, tire strategy visualization, and AI-generated insights during races.

### F1 Academy
Interactive learning path from rookie to expert. Quizzes, gamification, and AI-powered adaptive explanations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts |
| Backend | Python FastAPI |
| Database | Supabase PostgreSQL + pgvector |
| Cache | Upstash Redis |
| LLM | Groq (Llama 3.1 70B) with provider abstraction |
| Embeddings | BGE-base-en-v1.5 + cross-encoder reranking |
| ML | LightGBM (Learning-to-Rank) |
| Real-time | F1 SignalR feed, Server-Sent Events |
| Hosting | Vercel (frontend), Render (backend) |

## Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- Python 3.11+
- Supabase account (free tier)
- Groq API key (free)

### Setup

```bash
# Clone
git clone https://github.com/joythishreddye/pitwall.git
cd pitwall

# Frontend
cd frontend
pnpm install
pnpm dev

# Backend (new terminal)
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in your keys
uvicorn app.main:app --reload
```

## Architecture

```
Users (Browser)
      |
  [Vercel CDN]
      |
  Next.js 15 (App Router)
      |
  HTTPS / SSE
      |
  FastAPI (Render)
      |
  +---+---+---+---+
  |   |   |   |   |
 Chat Pred Live Data Quiz
  |   |   |   |   |
 Groq LGB  F1  FF1 Supabase
      |  SignalR |
  [Supabase PG + pgvector]
      |
  [Upstash Redis]
```

## Data Sources

This project uses the following open-source F1 data:
- [FastF1](https://github.com/theOehrly/Fast-F1) — F1 telemetry and timing data (MIT License)
- [OpenF1](https://github.com/br-g/openf1) — Real-time and historical F1 data API (MIT License)
- [Jolpica API](https://github.com/jolpica/jolpica-f1) — Historical F1 results (Ergast successor)
- [f1db](https://github.com/f1db/f1db) — Complete F1 database from 1950 (CC BY 4.0)

## License

MIT License. See [LICENSE](LICENSE) for details.

## Author

**Joythish Reddy Evuri** — [LinkedIn](https://linkedin.com) | [GitHub](https://github.com/joythishreddye)

---

Built with [Claude Code](https://claude.com/claude-code)
