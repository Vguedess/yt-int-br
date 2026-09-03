import { Pool } from 'pg';
import type { XRecentCountSnapshot, XTrendSnapshot } from '@/lib/x-api';

const globalForXDb = globalThis as unknown as { xTrendsPool?: Pool };

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!globalForXDb.xTrendsPool) {
    globalForXDb.xTrendsPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }
  return globalForXDb.xTrendsPool;
}

function hourBucket(value: string): string {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

export type StoredXTopicCount = {
  topicKey: string;
  observedHour: string;
  query: string;
  totalPosts24h: number;
  latestHourPosts: number;
  previousHourPosts: number;
  velocityPct: number;
  accelerationPct: number;
};

export async function ensureXTrendsSchema(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS x_trend_snapshots (
      market TEXT NOT NULL,
      woeid BIGINT NOT NULL,
      observed_hour TIMESTAMPTZ NOT NULL,
      rank SMALLINT NOT NULL,
      trend_name TEXT NOT NULL,
      post_count BIGINT,
      PRIMARY KEY (market, observed_hour, rank)
    );

    CREATE INDEX IF NOT EXISTS x_trend_snapshots_market_time_idx
      ON x_trend_snapshots (market, observed_hour DESC, rank ASC);

    CREATE TABLE IF NOT EXISTS x_topic_count_snapshots (
      topic_key TEXT NOT NULL,
      observed_hour TIMESTAMPTZ NOT NULL,
      query TEXT NOT NULL,
      total_posts_24h BIGINT NOT NULL,
      latest_hour_posts BIGINT NOT NULL,
      previous_hour_posts BIGINT NOT NULL,
      velocity_pct DOUBLE PRECISION NOT NULL,
      acceleration_pct DOUBLE PRECISION NOT NULL,
      PRIMARY KEY (topic_key, observed_hour)
    );

    CREATE INDEX IF NOT EXISTS x_topic_count_snapshots_time_idx
      ON x_topic_count_snapshots (observed_hour DESC, topic_key);
  `);
}

export async function persistXTrendSnapshot(snapshot: XTrendSnapshot): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  await ensureXTrendsSchema();
  const observedHour = hourBucket(snapshot.observedAt);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const trend of snapshot.trends) {
      await client.query(`
        INSERT INTO x_trend_snapshots (market, woeid, observed_hour, rank, trend_name, post_count)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (market, observed_hour, rank) DO UPDATE SET
          woeid = EXCLUDED.woeid,
          trend_name = EXCLUDED.trend_name,
          post_count = EXCLUDED.post_count
      `, [snapshot.market, snapshot.woeid, observedHour, trend.rank, trend.name, trend.postCount]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestXTrendSnapshot(market: string = 'BR'): Promise<XTrendSnapshot | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureXTrendsSchema();
  const latest = await pool.query<{ observed_hour: Date; woeid: string }>(`
    SELECT observed_hour, woeid
    FROM x_trend_snapshots
    WHERE market = $1
    ORDER BY observed_hour DESC
    LIMIT 1
  `, [market]);
  if (!latest.rows.length) return null;
  const observedHour = latest.rows[0].observed_hour;
  const rows = await pool.query<{ rank: number; trend_name: string; post_count: string | null }>(`
    SELECT rank, trend_name, post_count
    FROM x_trend_snapshots
    WHERE market = $1 AND observed_hour = $2
    ORDER BY rank ASC
  `, [market, observedHour]);
  return {
    market: 'BR',
    woeid: Number(latest.rows[0].woeid),
    observedAt: observedHour.toISOString(),
    trends: rows.rows.map((row) => ({
      rank: row.rank,
      name: row.trend_name,
      postCount: row.post_count == null ? null : Number(row.post_count)
    }))
  };
}

export async function persistXTopicCount(topicKey: string, snapshot: XRecentCountSnapshot): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  await ensureXTrendsSchema();
  const observedHour = hourBucket(snapshot.observedAt);
  await pool.query(`
    INSERT INTO x_topic_count_snapshots (
      topic_key, observed_hour, query, total_posts_24h, latest_hour_posts,
      previous_hour_posts, velocity_pct, acceleration_pct
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (topic_key, observed_hour) DO UPDATE SET
      query = EXCLUDED.query,
      total_posts_24h = EXCLUDED.total_posts_24h,
      latest_hour_posts = EXCLUDED.latest_hour_posts,
      previous_hour_posts = EXCLUDED.previous_hour_posts,
      velocity_pct = EXCLUDED.velocity_pct,
      acceleration_pct = EXCLUDED.acceleration_pct
  `, [
    topicKey,
    observedHour,
    snapshot.query,
    snapshot.totalPosts24h,
    snapshot.latestHourPosts,
    snapshot.previousHourPosts,
    snapshot.velocityPct,
    snapshot.accelerationPct
  ]);
}

export async function getLatestXTopicCount(topicKey: string): Promise<StoredXTopicCount | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureXTrendsSchema();
  const result = await pool.query<{
    observed_hour: Date;
    query: string;
    total_posts_24h: string;
    latest_hour_posts: string;
    previous_hour_posts: string;
    velocity_pct: number;
    acceleration_pct: number;
  }>(`
    SELECT observed_hour, query, total_posts_24h, latest_hour_posts,
           previous_hour_posts, velocity_pct, acceleration_pct
    FROM x_topic_count_snapshots
    WHERE topic_key = $1
    ORDER BY observed_hour DESC
    LIMIT 1
  `, [topicKey]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    topicKey,
    observedHour: row.observed_hour.toISOString(),
    query: row.query,
    totalPosts24h: Number(row.total_posts_24h),
    latestHourPosts: Number(row.latest_hour_posts),
    previousHourPosts: Number(row.previous_hour_posts),
    velocityPct: row.velocity_pct,
    accelerationPct: row.acceleration_pct
  };
}
