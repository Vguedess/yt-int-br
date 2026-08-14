# Compatibility baseline

Verified on 2026-08-14 for the `yt-int-br` foundation.

## Chosen runtime baseline

- Next.js: **16.2.12**
- React / React DOM: **19.2.8**
- Node.js: **24.x LTS**
- TypeScript: **5.9.2**

Node 24 is the chosen production runtime. Next.js 16 requires Node >=20.9, while the current `pgvector` Node package and the current OpenAI Node SDK require Node >=22. Node 24 satisfies all of these constraints and is the Vercel project baseline, so there is no reason to force the application down to Node 22.

## Base dependency matrix

| Capability | Package / version | Next 16.2.12 status | Decision |
|---|---|---|---|
| React runtime | `react` / `react-dom` 19.2.8 | Compatible; Next 16 is aligned with React 19.2 | Installed and pinned |
| TypeScript | `typescript` 5.9.2 | Compatible; Next 16 requires TS >=5.1 | Installed and pinned |
| Node typings | `@types/node` 24.13.3 | Matches the Node 24 runtime line | Installed and pinned |
| Styling | `tailwindcss` 4.3.3 + `@tailwindcss/postcss` 4.3.3 | Official Tailwind Next.js setup; no Next peer conflict | Installed and pinned |
| Async client state | `@tanstack/react-query` 5.101.4 | Peer supports React 18 or 19 | Installed and pinned |
| Charts | `recharts` 3.10.1 | Peer supports React 19 | Installed with `react-is` matching React 19.2.8 |
| Google / YouTube APIs | `googleapis` 174.0.1 | Node library; no Next peer dependency | Installed and pinned |
| OpenAI | `openai` 7.1.0 | Server-side Node SDK; no Next peer dependency | Installed and pinned; Node >=22 required |
| PostgreSQL | `pg` 8.22.0 | Node library; no Next peer dependency | Installed and pinned |
| Vector storage | `pgvector` 0.3.0 | Node library; no Next peer dependency | Installed and pinned; Node >=22 required |
| Graph storage | `neo4j-driver` 6.2.0 | Node library; supports LTS Node | Installed and pinned |
| Monitoring | `@sentry/nextjs` | Sentry maintains Next 16 E2E test apps | Approved for later installation |
| Google sign-in wrapper | `next-auth` 5.0.0-beta.32 | Declares peer support for Next ^16 and React ^19, but is still beta | **Not a base dependency yet** |

## Authentication decision

Google OAuth / YouTube authorization is required by the product, but it does not require us to make Auth.js a foundational dependency today.

For the first real Google/YouTube integrations, use the official `googleapis` / Google OAuth 2.0 client on the server. Auth.js v5 may later be added for application sign-in once its release maturity is acceptable; its current beta package already declares Next 16 compatibility.

This separates two concerns:

1. **Identity/login to YT Intelligence BR**.
2. **Authorization to access YouTube Data / Analytics / Reporting scopes**.

They may use Google in both cases but should not be forced through one library.

## Python services

The planned FastAPI/Pydantic/SQLAlchemy/Alembic, Celery, ML, forecasting and worker stack is a separate Python service boundary. Those packages do not have a Next.js peer-dependency relationship and therefore do not constrain the Next.js version.

## Upgrade policy

- Production dependencies are pinned to exact top-level versions in `package.json`.
- Production runtime is Node 24.x unless a verified incompatibility requires a change.
- Do not use Next.js preview/canary releases for production.
- A dependency upgrade must pass `npm install`, `npm run typecheck` and `npm run build` before merge/deploy.
- If a new package cannot support Node 24 + React 19.2 + Next 16.2, prefer replacing that package over downgrading the whole application unless it is strategically essential.
- Re-evaluate this matrix before adding authentication, ORM/database abstractions, a component library, queues or observability agents.
