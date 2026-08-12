# Architecture — YouTube Intelligence BR

## Product thesis
The system is a decision engine, not a generic trend dashboard. Its output is a ranked queue of videos that should be produced for a Brazilian YouTube channel under user-defined constraints.

The domain treats attention as a complex adaptive system. Topics move through sources, platforms and countries; demand and content supply co-evolve; attention may concentrate in a few winners; production latency changes whether a detected opportunity is still useful.

## Core graph

`Sources <-> Topics <-> Platforms <-> Countries <-> Content`

Future graph edges hold `weight`, `lag_hours`, `confidence`, `decay`, `observed_at` and provenance. Neo4j is the intended temporal knowledge-graph implementation, but domain services only depend on `GraphStore`.

## Vector memory
PostgreSQL + pgvector is reserved for semantic memory and retrieval. The `VectorStore` boundary supports three horizons:
- short: current collection window and active decisions;
- medium: recent user feedback, experiments and channel patterns;
- long: channel identity, durable preferences, historical winners and learned topic/format relationships.

## First decision state
Each candidate contains demand, velocity, acceleration, supply, supply velocity, view concentration, audience fit, novelty, source strength, information lead, longevity and risk.

The first regimes are:
- PRE_TREND
- ACCELERATION
- PEAK
- DECLINE
- EVERGREEN

The engine must ultimately score the expected state **when production completes**, not only the state when a signal is detected.

## Data plane
Signal providers normalize external observations before they enter the domain. Planned adapters:
- YouTube Data API;
- YouTube Analytics / Reporting for authenticated channel data;
- Google Trends when available;
- RSS/news providers;
- Wikipedia Pageviews;
- Reddit where permitted;
- licensed social-listening providers;
- manual imports;
- future country/platform-specific feeds.

No provider is allowed to write directly into decision logic.

## AI plane
OpenAI is an optional provider behind server-side environment variables. Initial use cases:
- semantic topic normalization;
- narrative/entity extraction;
- clustering support;
- explanation generation;
- research and later script/title/thumbnail agents.

AI output must be schema-validated before persistence. The project uses the Responses API boundary and disables response storage in its minimal provider.

## Recurring collection
`/api/cron/sync` is the first orchestration boundary. Vercel Cron triggers it in production. Heavy collectors can later enqueue durable work instead of completing within one HTTP invocation.

## Storage evolution
1. Foundation: no external DB required; deterministic demonstration signals.
2. PostgreSQL: users, channels, constraints, normalized observations, decisions, experiments.
3. pgvector: semantic memories and embeddings.
4. Neo4j: temporal source/topic/platform/country diffusion graph.
5. time-series extension: TimescaleDB or equivalent if snapshot volume requires it.

## Security boundaries
- secrets only in server environment variables;
- `.env*` excluded from Git;
- cron can be protected by `CRON_SECRET`;
- browser never receives provider tokens;
- future OAuth tokens must be encrypted at rest;
- external data keeps provenance and collection timestamps.
