import { Pool } from 'pg';
import type { SocialBladeYouTubeStats } from '@/lib/socialblade';

const globalForDb = globalThis as unknown as { ytIntPool?: Pool };

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!globalForDb.ytIntPool) {
    globalForDb.ytIntPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalForDb.ytIntPool;
}

export async function ensureSocialBladeSchema(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS socialblade_channel_snapshots (
      channel_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      handle TEXT,
      total_subscribers BIGINT,
      total_views BIGINT,
      total_uploads BIGINT,
      subscribers_gain_1d BIGINT,
      subscribers_gain_3d BIGINT,
      subscribers_gain_7d BIGINT,
      subscribers_gain_14d BIGINT,
      subscribers_gain_30d BIGINT,
      views_gain_1d BIGINT,
      views_gain_3d BIGINT,
      views_gain_7d BIGINT,
      views_gain_14d BIGINT,
      views_gain_30d BIGINT,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS socialblade_channel_daily (
      channel_id TEXT NOT NULL,
      observed_date DATE NOT NULL,
      subscribers BIGINT NOT NULL,
      views BIGINT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, observed_date)
    );

    CREATE INDEX IF NOT EXISTS socialblade_channel_daily_channel_date_idx
      ON socialblade_channel_daily (channel_id, observed_date DESC);
  `);
}

function growth(stats: SocialBladeYouTubeStats, kind: 'subs' | 'views', days: '1' | '3' | '7' | '14' | '30'): number | null {
  const value = kind === 'subs' ? stats.subscriberGrowth[days] : stats.viewGrowth[days];
  return Number.isFinite(value) ? value! : null;
}

export async function upsertSocialBladeStats(stats: SocialBladeYouTubeStats): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  await ensureSocialBladeSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO socialblade_channel_snapshots (
        channel_id, display_name, handle,
        total_subscribers, total_views, total_uploads,
        subscribers_gain_1d, subscribers_gain_3d, subscribers_gain_7d, subscribers_gain_14d, subscribers_gain_30d,
        views_gain_1d, views_gain_3d, views_gain_7d, views_gain_14d, views_gain_30d,
        fetched_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()
      )
      ON CONFLICT (channel_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        handle = EXCLUDED.handle,
        total_subscribers = EXCLUDED.total_subscribers,
        total_views = EXCLUDED.total_views,
        total_uploads = EXCLUDED.total_uploads,
        subscribers_gain_1d = EXCLUDED.subscribers_gain_1d,
        subscribers_gain_3d = EXCLUDED.subscribers_gain_3d,
        subscribers_gain_7d = EXCLUDED.subscribers_gain_7d,
        subscribers_gain_14d = EXCLUDED.subscribers_gain_14d,
        subscribers_gain_30d = EXCLUDED.subscribers_gain_30d,
        views_gain_1d = EXCLUDED.views_gain_1d,
        views_gain_3d = EXCLUDED.views_gain_3d,
        views_gain_7d = EXCLUDED.views_gain_7d,
        views_gain_14d = EXCLUDED.views_gain_14d,
        views_gain_30d = EXCLUDED.views_gain_30d,
        fetched_at = NOW()`,
      [
        stats.channelId,
        stats.displayName,
        stats.handle ?? null,
        stats.totalSubscribers,
        stats.totalViews,
        stats.totalUploads,
        growth(stats, 'subs', '1'),
        growth(stats, 'subs', '3'),
        growth(stats, 'subs', '7'),
        growth(stats, 'subs', '14'),
        growth(stats, 'subs', '30'),
        growth(stats, 'views', '1'),
        growth(stats, 'views', '3'),
        growth(stats, 'views', '7'),
        growth(stats, 'views', '14'),
        growth(stats, 'views', '30')
      ]
    );

    for (const point of stats.daily) {
      await client.query(
        `INSERT INTO socialblade_channel_daily (channel_id, observed_date, subscribers, views, fetched_at)
         VALUES ($1, $2::date, $3, $4, NOW())
         ON CONFLICT (channel_id, observed_date) DO UPDATE SET
           subscribers = EXCLUDED.subscribers,
           views = EXCLUDED.views,
           fetched_at = NOW()`,
        [stats.channelId, point.date, point.subs, point.views]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type SocialBladeGrowthLeader = {
  channelId: string;
  channelTitle: string;
  subscribersGain24h: number;
  viewsGain24h: number | null;
  totalSubscribers: number | null;
  totalViews: number | null;
  observedAt: string;
  source: 'socialblade';
};

export async function getSocialBladeGrowthLeader(channelIds: string[]): Promise<SocialBladeGrowthLeader | null> {
  const pool = getPool();
  const ids = [...new Set(channelIds.filter(Boolean))];
  if (!pool || !ids.length) return null;

  try {
    const result = await pool.query<{
      channel_id: string;
      display_name: string;
      subscribers_gain_1d: string | null;
      views_gain_1d: string | null;
      total_subscribers: string | null;
      total_views: string | null;
      fetched_at: Date;
    }>(
      `SELECT channel_id, display_name, subscribers_gain_1d, views_gain_1d,
              total_subscribers, total_views, fetched_at
       FROM socialblade_channel_snapshots
       WHERE channel_id = ANY($1::text[])
         AND subscribers_gain_1d IS NOT NULL
       ORDER BY subscribers_gain_1d DESC, views_gain_1d DESC NULLS LAST
       LIMIT 1`,
      [ids]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      channelId: row.channel_id,
      channelTitle: row.display_name,
      subscribersGain24h: Number(row.subscribers_gain_1d),
      viewsGain24h: row.views_gain_1d == null ? null : Number(row.views_gain_1d),
      totalSubscribers: row.total_subscribers == null ? null : Number(row.total_subscribers),
      totalViews: row.total_views == null ? null : Number(row.total_views),
      observedAt: row.fetched_at.toISOString(),
      source: 'socialblade'
    };
  } catch {
    return null;
  }
}
