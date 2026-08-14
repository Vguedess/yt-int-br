# YouTube Intelligence BR

Foundation for a Brazilian YouTube video decision system focused on maximizing views/engagement under dynamic user constraints.

## Runtime baseline

The web application baseline is intentionally pinned for dependency compatibility:

- **Next.js 16.2.12**
- **React / React DOM 19.2.8**
- **Node.js 24.x LTS**
- **TypeScript 5.9.2**

See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for the verified dependency matrix and upgrade policy.

## Run locally

Use Node.js 24.x, then:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Foundation capabilities

- Responsive web foundation.
- Dynamic topic/time/objective constraint contracts.
- Explainable demo ranking across PRE_TREND, PEAK and DECLINE regimes.
- HTTP API: `/api/health`, `/api/decisions`, `/api/cron/sync`.
- Provider registry and environment-variable configuration.
- Architecture boundaries for PostgreSQL + pgvector and Neo4j.
- Short/medium/long memory contracts.
- Vercel Cron orchestration boundary.
- Base packages reserved for TanStack Query, Recharts, Google/YouTube APIs, OpenAI, PostgreSQL/pgvector and Neo4j.

## Authentication note

Google/YouTube OAuth will initially use Google's official server-side Node client. `next-auth` / Auth.js v5 declares compatibility with Next 16, but remains beta, so it is deliberately not a foundational dependency yet.

## Environment

Copy `.env.example` to `.env.local`. No credential is required for the foundation UI.

## Architecture

See:

- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/COMPATIBILITY.md`
