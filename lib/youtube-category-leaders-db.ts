import { Pool } from 'pg';
import type { CategoryLeaderCollection, CategoryLeader, LeaderCategoryKey } from '@/lib/youtube-category-leaders';

const globalForLeaderDb = globalThis as unknown as { ytLeaderPool?: Pool };
const REFRESH_INTERVAL_HOURS = 12;
const REFRESH_LOCK_KEY = 7242026;

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');

  if (!globalForLeaderDb.ytLeaderPool) {
    globalForLeaderDb.ytLeaderPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }
  return globalForLeaderDb.ytLeaderPool;
}

export type LeaderDashboard = {
  runId: string;
  collectedAt: string;
  windowStart: string;
  windowHours: 24;
  region: 'BR';
  leaders: CategoryLeader[];
  errors: Array<{ categoryKey: LeaderCategoryKey; message: string }>;
  canRefresh: boolean;
  nextRefreshAt: string;
  ageHours: number;
};

export async function ensureCategoryLeaderSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_category_leader_runs (
      run_id TEXT PRIMARY KEY,
      collected_at TIMESTAMPTZ NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      window_hours SMALLINT NOT NULL,
      region TEXT NOT NULL,
      leader_count SMALLINT NOT NULL,
      errors JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS youtube_category_leaders (
      run_id TEXT NOT NULL REFERENCES youtube_category_leader_runs(run_id) ON DELETE CASCADE,
      category_key TEXT NOT NULL,
      category_label TEXT NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_title TEXT NOT NULL,
      channel_country TEXT,
      thumbnail_url TEXT,
      published_at TIMESTAMPTZ NOT NULL,
      duration_seconds INTEGER NOT NULL,
      views BIGINT NOT NULL,
      likes BIGINT NOT NULL,
      comments BIGINT NOT NULL,
      subscribers BIGINT,
      age_hours DOUBLE PRECISION NOT NULL,
      views_per_hour DOUBLE PRECISION NOT NULL,
      engagement_rate DOUBLE PRECISION NOT NULL,
      candidate_count INTEGER NOT NULL,
      PRIMARY KEY (run_id, category_key)
    );

    ALTER TABLE youtube_category_leaders
      ADD COLUMN IF NOT EXISTS channel_country TEXT;

    CREATE INDEX IF NOT EXISTS youtube_category_leader_runs_time_idx
      ON youtube_category_leader_runs (collected_at DESC);
    CREATE INDEX IF NOT EXISTS youtube_category_leaders_category_idx
      ON youtube_category_leaders (category_key, run_id);
  `);
}

export async function persistCategoryLeaderCollection(collection: CategoryLeaderCollection): Promise<string> {
  const pool = getPool();
  await ensureCategoryLeaderSchema();
  const client = await pool.connect();
  const runId = collection.collectedAt;

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO youtube_category_leader_runs (
        run_id, collected_at, window_start, window_hours, region, leader_count, errors
      ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (run_id) DO NOTHING`,
      [
        runId,
        collection.collectedAt,
        collection.windowStart,
        collection.windowHours,
        collection.region,
        collection.leaders.length,
        JSON.stringify(collection.errors)
      ]
    );

    for (const leader of collection.leaders) {
      await client.query(
        `INSERT INTO youtube_category_leaders (
          run_id, category_key, category_label, video_id, title, channel_id, channel_title, channel_country,
          thumbnail_url, published_at, duration_seconds, views, likes, comments, subscribers,
          age_hours, views_per_hour, engagement_rate, candidate_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (run_id, category_key) DO UPDATE SET
          category_label = EXCLUDED.category_label,
          video_id = EXCLUDED.video_id,
          title = EXCLUDED.title,
          channel_id = EXCLUDED.channel_id,
          channel_title = EXCLUDED.channel_title,
          channel_country = EXCLUDED.channel_country,
          thumbnail_url = EXCLUDED.thumbnail_url,
          published_at = EXCLUDED.published_at,
          duration_seconds = EXCLUDED.duration_seconds,
          views = EXCLUDED.views,
          likes = EXCLUDED.likes,
          comments = EXCLUDED.comments,
          subscribers = EXCLUDED.subscribers,
          age_hours = EXCLUDED.age_hours,
          views_per_hour = EXCLUDED.views_per_hour,
          engagement_rate = EXCLUDED.engagement_rate,
          candidate_count = EXCLUDED.candidate_count`,
        [
          runId,
          leader.categoryKey,
          leader.categoryLabel,
          leader.videoId,
          leader.title,
          leader.channelId,
          leader.channelTitle,
          leader.channelCountry,
          leader.thumbnailUrl,
          leader.publishedAt,
          leader.durationSeconds,
          leader.views,
          leader.likes,
          leader.comments,
          leader.subscribers,
          leader.ageHours,
          leader.viewsPerHour,
          leader.engagementRate,
          leader.candidateCount
        ]
      );
    }

    await client.query('COMMIT');
    return runId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function refreshState(collectedAt: string) {
  const ageMs = Math.max(0, Date.now() - new Date(collectedAt).getTime());
  const ageHours = ageMs / 3_600_000;
  const nextRefreshAt = new Date(new Date(collectedAt).getTime() + REFRESH_INTERVAL_HOURS * 3_600_000).toISOString();
  return {
    ageHours,
    nextRefreshAt,
    canRefresh: ageHours >= REFRESH_INTERVAL_HOURS
  };
}

export async function getLatestCategoryLeaderDashboard(): Promise<LeaderDashboard | null> {
  const pool = getPool();
  await ensureCategoryLeaderSchema();

  const runResult = await pool.query<{
    run_id: string;
    collected_at: Date;
    window_start: Date;
    window_hours: number;
    region: string;
    errors: Array<{ categoryKey: LeaderCategoryKey; message: string }>;
  }>(`
    SELECT run_id, collected_at, window_start, window_hours, region, errors
    FROM youtube_category_leader_runs
    WHERE leader_count > 0
    ORDER BY collected_at DESC
    LIMIT 1
  `);

  const run = runResult.rows[0];
  if (!run) return null;

  const leaderResult = await pool.query<{
    category_key: LeaderCategoryKey;
    category_label: string;
    video_id: string;
    title: string;
    channel_id: string;
    channel_title: string;
    channel_country: string | null;
    thumbnail_url: string | null;
    published_at: Date;
    duration_seconds: number;
    views: string;
    likes: string;
    comments: string;
    subscribers: string | null;
    age_hours: number;
    views_per_hour: number;
    engagement_rate: number;
    candidate_count: number;
  }>(`
    SELECT *
    FROM youtube_category_leaders
    WHERE run_id = $1
    ORDER BY CASE category_key
      WHEN 'news-politics' THEN 1
      WHEN 'science-tech' THEN 2
      WHEN 'economia' THEN 3
      WHEN 'entretenimento' THEN 4
      ELSE 5
    END
  `, [run.run_id]);

  const leaders: CategoryLeader[] = leaderResult.rows.map((row) => ({
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    videoId: row.video_id,
    title: row.title,
    channelId: row.channel_id,
    channelTitle: row.channel_title,
    channelCountry: row.channel_country,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at.toISOString(),
    durationSeconds: row.duration_seconds,
    views: Number(row.views),
    likes: Number(row.likes),
    comments: Number(row.comments),
    subscribers: row.subscribers == null ? null : Number(row.subscribers),
    ageHours: row.age_hours,
    viewsPerHour: row.views_per_hour,
    engagementRate: row.engagement_rate,
    candidateCount: row.candidate_count
  }));

  const collectedAt = run.collected_at.toISOString();
  return {
    runId: run.run_id,
    collectedAt,
    windowStart: run.window_start.toISOString(),
    windowHours: 24,
    region: 'BR',
    leaders,
    errors: Array.isArray(run.errors) ? run.errors : [],
    ...refreshState(collectedAt)
  };
}

export async function withCategoryLeaderRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  let locked = false;
  try {
    const lockResult = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [REFRESH_LOCK_KEY]
    );
    locked = Boolean(lockResult.rows[0]?.locked);
    if (!locked) throw new Error('refresh_in_progress');
    return await work();
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [REFRESH_LOCK_KEY]);
    client.release();
  }
}

export const CATEGORY_LEADER_REFRESH_INTERVAL_HOURS = REFRESH_INTERVAL_HOURS;
