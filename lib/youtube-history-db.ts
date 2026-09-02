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
  `);
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
