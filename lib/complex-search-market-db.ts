import { Pool } from 'pg';

const globalForComplexMarketDb = globalThis as unknown as { complexMarketPool?: Pool };

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!globalForComplexMarketDb.complexMarketPool) {
    globalForComplexMarketDb.complexMarketPool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalForComplexMarketDb.complexMarketPool;
}

export type ComplexYoutubeSignal = {
  videoId: string;
  title: string;
  channelTitle: string;
  categoryKey: string;
};

export async function getLatestComplexYoutubeSignals(limit: number = 80): Promise<ComplexYoutubeSignal[]> {
  const pool = getPool();
  if (!pool) return [];
  const safeLimit = Math.max(8, Math.min(160, Math.floor(limit)));

  try {
    const result = await pool.query<{
      video_id: string;
      title: string;
      channel_title: string;
      category_key: string;
    }>(`
      WITH latest_hour AS (
        SELECT MAX(observed_hour) AS observed_hour
        FROM youtube_video_snapshots
      ), unique_videos AS (
        SELECT DISTINCT ON (video_id)
          video_id, title, channel_title, category_key, hype_score, views, views_per_hour_proxy
        FROM youtube_video_snapshots
        WHERE observed_hour = (SELECT observed_hour FROM latest_hour)
        ORDER BY video_id, hype_score DESC, views_per_hour_proxy DESC
      )
      SELECT video_id, title, channel_title, category_key
      FROM unique_videos
      ORDER BY hype_score DESC, views_per_hour_proxy DESC, views DESC
      LIMIT $1
    `, [safeLimit]);

    return result.rows.map((row) => ({
      videoId: row.video_id,
      title: row.title,
      channelTitle: row.channel_title,
      categoryKey: row.category_key
    }));
  } catch {
    return [];
  }
}
