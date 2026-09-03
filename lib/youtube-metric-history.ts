import { Pool } from 'pg';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
const MAX_TRACKED_REFS = 200;

const globalForMetricHistory = globalThis as unknown as { ytMetricHistoryPool?: Pool };

type TrackedVideoRef = {
  videoId: string;
  categoryKey: string;
};

type YouTubeMetricItem = {
  id?: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

type YouTubeMetricResponse = {
  items?: YouTubeMetricItem[];
};

type MetricPoint = {
  videoId: string;
  categoryKey: string;
  views: number;
  likes: number;
  comments: number;
};

function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!globalForMetricHistory.ytMetricHistoryPool) {
    globalForMetricHistory.ytMetricHistoryPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalForMetricHistory.ytMetricHistoryPool;
}

function number(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentHour(): string {
  const value = new Date();
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString();
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function ensureYoutubeMetricHistorySchema(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_video_metric_snapshots (
      video_id TEXT NOT NULL,
      category_key TEXT NOT NULL,
      observed_hour TIMESTAMPTZ NOT NULL,
      views BIGINT NOT NULL,
      likes BIGINT NOT NULL,
      comments BIGINT NOT NULL,
      views_gained BIGINT,
      likes_gained BIGINT,
      comments_gained BIGINT,
      velocity_views_per_hour DOUBLE PRECISION,
      acceleration_views_per_hour2 DOUBLE PRECISION,
      PRIMARY KEY (video_id, category_key, observed_hour)
    );

    CREATE INDEX IF NOT EXISTS youtube_video_metric_snapshots_time_idx
      ON youtube_video_metric_snapshots (observed_hour DESC);
    CREATE INDEX IF NOT EXISTS youtube_video_metric_snapshots_video_time_idx
      ON youtube_video_metric_snapshots (video_id, category_key, observed_hour DESC);
    CREATE INDEX IF NOT EXISTS youtube_video_metric_snapshots_velocity_idx
      ON youtube_video_metric_snapshots (observed_hour DESC, velocity_views_per_hour DESC NULLS LAST);
  `);
}

async function listTrackedVideoRefs(limit: number = MAX_TRACKED_REFS): Promise<TrackedVideoRef[]> {
  const pool = getPool();
  if (!pool) return [];

  await ensureYoutubeMetricHistorySchema();
  const result = await pool.query<{
    video_id: string;
    category_key: string;
  }>(`
    SELECT video_id, category_key
    FROM (
      SELECT DISTINCT ON (video_id, category_key)
        video_id,
        category_key,
        observed_hour,
        published_at
      FROM youtube_video_snapshots
      WHERE observed_hour >= NOW() - INTERVAL '14 days'
        AND published_at >= NOW() - INTERVAL '28 days'
      ORDER BY video_id, category_key, observed_hour DESC
    ) tracked
    ORDER BY observed_hour DESC
    LIMIT $1
  `, [Math.max(1, Math.min(limit, MAX_TRACKED_REFS))]);

  return result.rows.map((row) => ({
    videoId: row.video_id,
    categoryKey: row.category_key
  }));
}

async function fetchMetrics(videoIds: string[]): Promise<Map<string, YouTubeMetricItem>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not configured');

  const byId = new Map<string, YouTubeMetricItem>();
  const uniqueIds = [...new Set(videoIds.filter(Boolean))];

  for (const batch of chunks(uniqueIds, 50)) {
    const url = new URL(`${YOUTUBE_API_ROOT}/videos`);
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', key);

    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`YouTube metrics API ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as YouTubeMetricResponse;
    for (const item of payload.items ?? []) {
      if (item.id) byId.set(item.id, item);
    }
  }

  return byId;
}

async function persistMetricPoint(point: MetricPoint, observedHour: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');

  const previousResult = await pool.query<{
    observed_hour: Date;
    views: string;
    likes: string;
    comments: string;
    velocity_views_per_hour: number | null;
  }>(`
    SELECT observed_hour, views, likes, comments, velocity_views_per_hour
    FROM youtube_video_metric_snapshots
    WHERE video_id = $1
      AND category_key = $2
      AND observed_hour < $3
    ORDER BY observed_hour DESC
    LIMIT 1
  `, [point.videoId, point.categoryKey, observedHour]);

  const previous = previousResult.rows[0];
  let viewsGained: number | null = null;
  let likesGained: number | null = null;
  let commentsGained: number | null = null;
  let velocity: number | null = null;
  let acceleration: number | null = null;

  if (previous) {
    const deltaHours = Math.max(
      1 / 60,
      (new Date(observedHour).getTime() - new Date(previous.observed_hour).getTime()) / 3_600_000
    );
    viewsGained = Math.max(0, point.views - Number(previous.views));
    likesGained = Math.max(0, point.likes - Number(previous.likes));
    commentsGained = Math.max(0, point.comments - Number(previous.comments));
    velocity = viewsGained / deltaHours;

    if (previous.velocity_views_per_hour !== null) {
      acceleration = (velocity - previous.velocity_views_per_hour) / deltaHours;
    }
  }

  await pool.query(`
    INSERT INTO youtube_video_metric_snapshots (
      video_id, category_key, observed_hour, views, likes, comments,
      views_gained, likes_gained, comments_gained,
      velocity_views_per_hour, acceleration_views_per_hour2
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (video_id, category_key, observed_hour) DO UPDATE SET
      views = EXCLUDED.views,
      likes = EXCLUDED.likes,
      comments = EXCLUDED.comments,
      views_gained = COALESCE(EXCLUDED.views_gained, youtube_video_metric_snapshots.views_gained),
      likes_gained = COALESCE(EXCLUDED.likes_gained, youtube_video_metric_snapshots.likes_gained),
      comments_gained = COALESCE(EXCLUDED.comments_gained, youtube_video_metric_snapshots.comments_gained),
      velocity_views_per_hour = COALESCE(EXCLUDED.velocity_views_per_hour, youtube_video_metric_snapshots.velocity_views_per_hour),
      acceleration_views_per_hour2 = COALESCE(EXCLUDED.acceleration_views_per_hour2, youtube_video_metric_snapshots.acceleration_views_per_hour2)
  `, [
    point.videoId,
    point.categoryKey,
    observedHour,
    point.views,
    point.likes,
    point.comments,
    viewsGained,
    likesGained,
    commentsGained,
    velocity,
    acceleration
  ]);
}

export async function refreshTrackedYoutubeMetrics(): Promise<{
  configured: boolean;
  observedHour: string;
  trackedRefs: number;
  uniqueVideos: number;
  storedRows: number;
  missingVideos: number;
}> {
  const pool = getPool();
  const observedHour = currentHour();
  if (!pool) {
    return {
      configured: false,
      observedHour,
      trackedRefs: 0,
      uniqueVideos: 0,
      storedRows: 0,
      missingVideos: 0
    };
  }

  const refs = await listTrackedVideoRefs();
  const uniqueVideoIds = [...new Set(refs.map((ref) => ref.videoId))];
  if (!uniqueVideoIds.length) {
    return {
      configured: true,
      observedHour,
      trackedRefs: 0,
      uniqueVideos: 0,
      storedRows: 0,
      missingVideos: 0
    };
  }

  const metrics = await fetchMetrics(uniqueVideoIds);
  let storedRows = 0;

  for (const ref of refs) {
    const item = metrics.get(ref.videoId);
    if (!item) continue;

    await persistMetricPoint({
      videoId: ref.videoId,
      categoryKey: ref.categoryKey,
      views: number(item.statistics?.viewCount),
      likes: number(item.statistics?.likeCount),
      comments: number(item.statistics?.commentCount)
    }, observedHour);
    storedRows += 1;
  }

  return {
    configured: true,
    observedHour,
    trackedRefs: refs.length,
    uniqueVideos: uniqueVideoIds.length,
    storedRows,
    missingVideos: Math.max(0, uniqueVideoIds.length - metrics.size)
  };
}
