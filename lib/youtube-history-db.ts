import { Pool } from 'pg';
import type { CurrentPopularitySnapshot, MacroRadar } from '@/lib/youtube-popularity';

const globalForHistoryDb = globalThis as unknown as { ytHistoryPool?: Pool };

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!globalForHistoryDb.ytHistoryPool) {
    globalForHistoryDb.ytHistoryPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }
  return globalForHistoryDb.ytHistoryPool;
}

function hourBucket(value: string): string {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

export type HistoricalHypeVideo = {
  videoId: string;
  categoryKey: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
  observedHour: string;
  subscribers: number | null;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  viewsPerHour: number;
  nodeTier: string;
  networkEscape: number;
  nodeDifficulty: number;
  breakoutStrength: number;
  viralForce: number;
  hypeScore: number;
  modelVersion: string;
};

export type ManualHypeSnapshot = {
  batchId: string;
  market: string;
  observedAt: string;
  source: string;
  filters: string[];
  videoIds: string[];
};

export async function ensureYoutubeHistorySchema(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_video_snapshots (
      video_id TEXT NOT NULL,
      category_key TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      title TEXT NOT NULL,
      published_at TIMESTAMPTZ NOT NULL,
      observed_hour TIMESTAMPTZ NOT NULL,
      age_hours DOUBLE PRECISION NOT NULL,
      subscribers BIGINT,
      views BIGINT NOT NULL,
      likes BIGINT NOT NULL,
      comments BIGINT NOT NULL,
      engagement_rate DOUBLE PRECISION NOT NULL,
      views_per_hour_proxy DOUBLE PRECISION NOT NULL,
      node_tier TEXT NOT NULL,
      expected_reach BIGINT NOT NULL,
      expected_reach_basis TEXT NOT NULL,
      network_escape DOUBLE PRECISION NOT NULL,
      node_difficulty SMALLINT NOT NULL,
      breakout_strength SMALLINT NOT NULL,
      viral_force SMALLINT NOT NULL,
      hype_score SMALLINT NOT NULL,
      model_version TEXT NOT NULL,
      PRIMARY KEY (video_id, category_key, observed_hour)
    );

    CREATE INDEX IF NOT EXISTS youtube_video_snapshots_channel_time_idx
      ON youtube_video_snapshots (channel_id, observed_hour DESC);
    CREATE INDEX IF NOT EXISTS youtube_video_snapshots_category_time_idx
      ON youtube_video_snapshots (category_key, observed_hour DESC);
    CREATE INDEX IF NOT EXISTS youtube_video_snapshots_breakout_idx
      ON youtube_video_snapshots (observed_hour DESC, breakout_strength DESC);
    CREATE INDEX IF NOT EXISTS youtube_video_snapshots_hype_idx
      ON youtube_video_snapshots (observed_hour DESC, hype_score DESC, viral_force DESC);

    CREATE TABLE IF NOT EXISTS youtube_topic_diffusion_snapshots (
      category_key TEXT NOT NULL,
      topic_key TEXT NOT NULL,
      topic_label TEXT NOT NULL,
      observed_hour TIMESTAMPTZ NOT NULL,
      stage TEXT NOT NULL,
      opportunity_score SMALLINT NOT NULL,
      video_count INTEGER NOT NULL,
      channel_count INTEGER NOT NULL,
      attention_share DOUBLE PRECISION NOT NULL,
      peripheral_breakout SMALLINT NOT NULL,
      medium_breakout SMALLINT NOT NULL,
      large_penetration SMALLINT NOT NULL,
      hub_penetration SMALLINT NOT NULL,
      model_version TEXT NOT NULL,
      basis TEXT NOT NULL,
      PRIMARY KEY (category_key, topic_key, observed_hour)
    );

    CREATE INDEX IF NOT EXISTS youtube_topic_diffusion_opportunity_idx
      ON youtube_topic_diffusion_snapshots (observed_hour DESC, opportunity_score DESC);

    CREATE TABLE IF NOT EXISTS youtube_manual_hype_snapshots (
      batch_id TEXT NOT NULL,
      market TEXT NOT NULL,
      rank SMALLINT NOT NULL CHECK (rank >= 1),
      video_id TEXT NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL,
      filters JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY (batch_id, rank),
      UNIQUE (batch_id, video_id)
    );

    CREATE INDEX IF NOT EXISTS youtube_manual_hype_snapshots_market_time_idx
      ON youtube_manual_hype_snapshots (market, observed_at DESC, rank ASC);
  `);
}

export async function persistManualHypeSnapshot(input: {
  batchId: string;
  market: string;
  videoIds: string[];
  source: string;
  filters: string[];
}): Promise<ManualHypeSnapshot> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  await ensureYoutubeHistorySchema();

  const ids = [...new Set(input.videoIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20);
  if (!ids.length) throw new Error('No video IDs supplied');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let index = 0; index < ids.length; index += 1) {
      await client.query(
        `INSERT INTO youtube_manual_hype_snapshots (
          batch_id, market, rank, video_id, source, filters
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
        ON CONFLICT (batch_id, rank) DO UPDATE SET
          market = EXCLUDED.market,
          video_id = EXCLUDED.video_id,
          source = EXCLUDED.source,
          filters = EXCLUDED.filters`,
        [input.batchId, input.market, index + 1, ids[index], input.source, JSON.stringify(input.filters)]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const latest = await getLatestManualHypeSnapshot(input.market);
  if (!latest) throw new Error('Manual Hype snapshot was not persisted');
  return latest;
}

export async function getLatestManualHypeSnapshot(market: string = 'BR'): Promise<ManualHypeSnapshot | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureYoutubeHistorySchema();

  const latest = await pool.query<{
    batch_id: string;
    observed_at: Date;
    source: string;
    filters: unknown;
  }>(`
    SELECT batch_id, observed_at, source, filters
    FROM youtube_manual_hype_snapshots
    WHERE market = $1
    ORDER BY observed_at DESC, rank ASC
    LIMIT 1
  `, [market]);

  if (!latest.rows.length) return null;
  const selected = latest.rows[0];
  const rows = await pool.query<{ video_id: string }>(`
    SELECT video_id
    FROM youtube_manual_hype_snapshots
    WHERE market = $1 AND batch_id = $2
    ORDER BY rank ASC
  `, [market, selected.batch_id]);

  const filters = Array.isArray(selected.filters) ? selected.filters.map(String) : [];
  return {
    batchId: selected.batch_id,
    market,
    observedAt: selected.observed_at.toISOString(),
    source: selected.source,
    filters,
    videoIds: rows.rows.map((row) => row.video_id)
  };
}

export async function getLatestHistoricalHypeVideos(limit: number = 4): Promise<{
  observedHour: string | null;
  videos: HistoricalHypeVideo[];
}> {
  const pool = getPool();
  if (!pool) return { observedHour: null, videos: [] };
  await ensureYoutubeHistorySchema();

  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const result = await pool.query<{
    video_id: string;
    category_key: string;
    channel_id: string;
    channel_title: string;
    title: string;
    published_at: Date;
    observed_hour: Date;
    subscribers: string | null;
    views: string;
    likes: string;
    comments: string;
    engagement_rate: number;
    views_per_hour_proxy: number;
    node_tier: string;
    network_escape: number;
    node_difficulty: number;
    breakout_strength: number;
    viral_force: number;
    hype_score: number;
    model_version: string;
  }>(`
    WITH latest_hour AS (
      SELECT MAX(observed_hour) AS observed_hour
      FROM youtube_video_snapshots
    ), per_video AS (
      SELECT DISTINCT ON (video_id)
        video_id, category_key, channel_id, channel_title, title, published_at, observed_hour,
        subscribers, views, likes, comments, engagement_rate, views_per_hour_proxy,
        node_tier, network_escape, node_difficulty, breakout_strength, viral_force,
        hype_score, model_version
      FROM youtube_video_snapshots
      WHERE observed_hour = (SELECT observed_hour FROM latest_hour)
      ORDER BY video_id, hype_score DESC, viral_force DESC, views_per_hour_proxy DESC
    )
    SELECT *
    FROM per_video
    ORDER BY hype_score DESC, viral_force DESC, breakout_strength DESC, views_per_hour_proxy DESC
    LIMIT $1
  `, [safeLimit]);

  const videos: HistoricalHypeVideo[] = result.rows.map((row) => ({
    videoId: row.video_id,
    categoryKey: row.category_key,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    title: row.title,
    publishedAt: row.published_at.toISOString(),
    observedHour: row.observed_hour.toISOString(),
    subscribers: row.subscribers == null ? null : Number(row.subscribers),
    views: Number(row.views),
    likes: Number(row.likes),
    comments: Number(row.comments),
    engagementRate: row.engagement_rate,
    viewsPerHour: row.views_per_hour_proxy,
    nodeTier: row.node_tier,
    networkEscape: row.network_escape,
    nodeDifficulty: row.node_difficulty,
    breakoutStrength: row.breakout_strength,
    viralForce: row.viral_force,
    hypeScore: row.hype_score,
    modelVersion: row.model_version
  }));

  return {
    observedHour: videos[0]?.observedHour ?? null,
    videos
  };
}

async function persistRadar(
  client: import('pg').PoolClient,
  radar: MacroRadar,
  observedHour: string
): Promise<{ videos: number; topics: number }> {
  let videos = 0;
  let topics = 0;

  for (const video of radar.videos) {
    await client.query(
      `INSERT INTO youtube_video_snapshots (
        video_id, category_key, channel_id, channel_title, title, published_at, observed_hour,
        age_hours, subscribers, views, likes, comments, engagement_rate, views_per_hour_proxy,
        node_tier, expected_reach, expected_reach_basis, network_escape, node_difficulty,
        breakout_strength, viral_force, hype_score, model_version
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      )
      ON CONFLICT (video_id, category_key, observed_hour) DO UPDATE SET
        subscribers = EXCLUDED.subscribers,
        views = EXCLUDED.views,
        likes = EXCLUDED.likes,
        comments = EXCLUDED.comments,
        engagement_rate = EXCLUDED.engagement_rate,
        views_per_hour_proxy = EXCLUDED.views_per_hour_proxy,
        node_tier = EXCLUDED.node_tier,
        expected_reach = EXCLUDED.expected_reach,
        expected_reach_basis = EXCLUDED.expected_reach_basis,
        network_escape = EXCLUDED.network_escape,
        node_difficulty = EXCLUDED.node_difficulty,
        breakout_strength = EXCLUDED.breakout_strength,
        viral_force = EXCLUDED.viral_force,
        hype_score = EXCLUDED.hype_score,
        model_version = EXCLUDED.model_version`,
      [
        video.id,
        radar.key,
        video.channelId,
        video.channelTitle,
        video.title,
        video.publishedAt,
        observedHour,
        video.ageHours,
        video.subscribers,
        video.views,
        video.likes,
        video.comments,
        video.engagementRate,
        video.viewsPerHour,
        video.nodeTier,
        video.expectedReach,
        video.expectedReachBasis,
        video.networkEscape,
        video.nodeDifficulty,
        video.breakoutStrength,
        video.viralForce,
        video.hypeScore,
        video.modelVersion
      ]
    );
    videos += 1;
  }

  for (const signal of radar.diffusionSignals) {
    await client.query(
      `INSERT INTO youtube_topic_diffusion_snapshots (
        category_key, topic_key, topic_label, observed_hour, stage, opportunity_score,
        video_count, channel_count, attention_share, peripheral_breakout, medium_breakout,
        large_penetration, hub_penetration, model_version, basis
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (category_key, topic_key, observed_hour) DO UPDATE SET
        topic_label = EXCLUDED.topic_label,
        stage = EXCLUDED.stage,
        opportunity_score = EXCLUDED.opportunity_score,
        video_count = EXCLUDED.video_count,
        channel_count = EXCLUDED.channel_count,
        attention_share = EXCLUDED.attention_share,
        peripheral_breakout = EXCLUDED.peripheral_breakout,
        medium_breakout = EXCLUDED.medium_breakout,
        large_penetration = EXCLUDED.large_penetration,
        hub_penetration = EXCLUDED.hub_penetration,
        model_version = EXCLUDED.model_version,
        basis = EXCLUDED.basis`,
      [
        radar.key,
        signal.topicKey,
        signal.topicLabel,
        observedHour,
        signal.stage,
        signal.opportunityScore,
        signal.videoCount,
        signal.channelCount,
        signal.attentionShare,
        signal.peripheralBreakout,
        signal.mediumBreakout,
        signal.largePenetration,
        signal.hubPenetration,
        signal.modelVersion,
        signal.basis
      ]
    );
    topics += 1;
  }

  return { videos, topics };
}

export async function persistYoutubePopularitySnapshot(snapshot: CurrentPopularitySnapshot): Promise<{
  configured: boolean;
  observedHour: string;
  videoRows: number;
  topicRows: number;
}> {
  const pool = getPool();
  const observedHour = hourBucket(snapshot.generatedAt);
  if (!pool || !snapshot.ok) {
    return { configured: Boolean(pool), observedHour, videoRows: 0, topicRows: 0 };
  }

  await ensureYoutubeHistorySchema();
  const client = await pool.connect();
  let videoRows = 0;
  let topicRows = 0;

  try {
    await client.query('BEGIN');
    for (const radar of snapshot.macroRadars) {
      const stored = await persistRadar(client, radar, observedHour);
      videoRows += stored.videos;
      topicRows += stored.topics;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { configured: true, observedHour, videoRows, topicRows };
}
