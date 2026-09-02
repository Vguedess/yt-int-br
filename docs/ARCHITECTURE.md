# Architecture — YouTube Intelligence BR

## Product thesis
The system is a decision engine, not a generic trend dashboard. Its output is a ranked queue of videos that should be produced for a Brazilian YouTube channel under user-defined constraints.

The domain treats attention as a complex adaptive system. Topics move through sources, platforms and countries; demand and content supply co-evolve; attention may concentrate in a few winners; production latency changes whether a detected opportunity is still useful.

## Core graph

`Sources <-> Topics <-> Platforms <-> Countries <-> Content`

Future graph edges hold `weight`, `lag_hours`, `confidence`, `decay`, `observed_at` and provenance. Neo4j is the intended temporal knowledge-graph implementation, but domain services only depend on `GraphStore`.

## Network-aware video scoring
A view count is not treated as node-invariant. Channels have materially different initial-distribution advantages, so the same observed views can represent very different propagation strength.

`lib/network-diffusion.ts` owns the network breakout model. Current node tiers are descriptive only:
- `PERIPHERAL`: <= 1M subscribers;
- `MEDIUM`: >1M to 5M;
- `LARGE`: >5M to 15M;
- `HUB`: >15M;
- `UNKNOWN`: subscriber count unavailable.

The model does **not** award points solely for being small. It estimates expected reach for the current cohort using a log regression over channel size and video age. `Network Escape = observed views / expected reach`. Node difficulty is then derived from expected-reach rank inside the cohort. When a same-channel historical baseline becomes available, that baseline takes precedence over the cohort prior.

The first network-aware outputs are:
- `expectedReach` and provenance;
- `networkEscape`;
- `nodeDifficulty`;
- `breakoutStrength`;
- `viralForce`;
- network-aware `hypeScore`.

`lib/topic-diffusion.ts` aggregates those video signals by topic and distinguishes peripheral breakout from penetration into large channels and hubs. The current stage is explicitly marked `current-cross-section-proxy`; it must not be presented as observed temporal propagation until enough snapshots exist.

## Native temporal history
`lib/youtube-history-db.ts` persists hourly-bucketed observations in Neon/Postgres:
- `youtube_video_snapshots`: views, likes, comments, age, channel size, network escape, breakout and viral-force signals;
- `youtube_topic_diffusion_snapshots`: topic opportunity, peripheral/medium breakout, large/hub penetration and diffusion stage.

The compound keys make retries idempotent inside an observation hour. This dataset will later support true view deltas, velocity, acceleration and comparable-age channel baselines.

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
`/api/cron/sync` is the orchestration boundary. Vercel Cron triggers it in production. The route requires `CRON_SECRET` because it mutates historical data and consumes provider quota. Native YouTube history is canonical; Social Blade is optional and explicitly opt-in through `SOCIALBLADE_ENABLED=true`.

Heavy collectors can later enqueue durable work instead of completing within one HTTP invocation.

## Storage evolution
1. Foundation: deterministic domain models and current public observations.
2. PostgreSQL: normalized channel/video/topic snapshots, users, constraints, decisions and experiments.
3. pgvector: semantic memories and embeddings.
4. Neo4j: temporal source/topic/platform/country diffusion graph.
5. time-series extension: TimescaleDB or equivalent if snapshot volume requires it.

## Security boundaries
- secrets only in server environment variables;
- `.env*` excluded from Git;
- cron requires `CRON_SECRET`;
- paid collectors are opt-in and cannot be inferred from the presence of credentials;
- browser never receives provider tokens;
- future OAuth tokens must be encrypted at rest;
- external data keeps provenance and collection timestamps.
