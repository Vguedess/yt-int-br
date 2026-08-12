# YouTube Intelligence BR

Foundation for a Brazilian YouTube video decision system focused on maximizing views/engagement under dynamic user constraints.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## What works in v0.1
- Responsive decision dashboard.
- Dynamic topic/time/objective constraints.
- Explainable demo ranking across PRE_TREND, PEAK and DECLINE regimes.
- HTTP API: `/api/health`, `/api/decisions`, `/api/cron/sync`.
- Provider registry and environment-variable configuration.
- Architecture boundaries for PostgreSQL + pgvector and Neo4j.
- Short/medium/long memory contracts.
- Vercel Cron orchestration boundary.

## Environment
Copy `.env.example` to `.env.local`. No credential is required for the foundation UI.

## Architecture
See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.
