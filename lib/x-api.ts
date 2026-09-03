export const X_BRAZIL_WOEID = 23424768;
export const X_API_BASE_URL = 'https://api.x.com/2';

export type XTrend = {
  rank: number;
  name: string;
  postCount: number | null;
};

export type XTrendSnapshot = {
  market: 'BR';
  woeid: number;
  observedAt: string;
  trends: XTrend[];
};

export type XCountBucket = {
  start: string;
  end: string;
  postCount: number;
};

export type XRecentCountSnapshot = {
  query: string;
  observedAt: string;
  totalPosts24h: number;
  latestHourPosts: number;
  previousHourPosts: number;
  velocityPct: number;
  accelerationPct: number;
  buckets: XCountBucket[];
};

function bearerToken(): string {
  const value = process.env.X_BEARER_TOKEN?.trim();
  if (!value) throw new Error('X_BEARER_TOKEN is not configured');
  return value;
}

async function xGet<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = new URL(`${X_API_BASE_URL}${path}`);
  if (params) url.search = params.toString();

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken()}`,
      Accept: 'application/json'
    },
    cache: 'no-store'
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload && 'detail' in payload
      ? String((payload as { detail?: unknown }).detail ?? '')
      : '';
    const title = typeof payload === 'object' && payload && 'title' in payload
      ? String((payload as { title?: unknown }).title ?? '')
      : '';
    throw new Error(`X API ${response.status}${title ? ` ${title}` : ''}${detail ? `: ${detail}` : ''}`);
  }

  return payload as T;
}

export async function fetchBrazilXTrends(maxTrends: number = 50): Promise<XTrendSnapshot> {
  const safeMax = Math.max(1, Math.min(50, Math.floor(maxTrends)));
  const params = new URLSearchParams({
    max_trends: String(safeMax),
    'trend.fields': 'trend_name,tweet_count'
  });

  const payload = await xGet<{
    data?: Array<{
      trend_name?: string;
      tweet_count?: number | string | null;
      post_count?: number | string | null;
    }>;
  }>(`/trends/by/woeid/${X_BRAZIL_WOEID}`, params);

  const trends = (payload.data ?? [])
    .map((item, index) => {
      const rawCount = item.tweet_count ?? item.post_count ?? null;
      const parsedCount = rawCount == null ? null : Number(rawCount);
      return {
        rank: index + 1,
        name: String(item.trend_name ?? '').trim(),
        postCount: Number.isFinite(parsedCount) ? parsedCount : null
      } satisfies XTrend;
    })
    .filter((item) => item.name);

  return {
    market: 'BR',
    woeid: X_BRAZIL_WOEID,
    observedAt: new Date().toISOString(),
    trends
  };
}

function roundPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(-999, Math.min(999, value)) * 10) / 10;
}

export async function fetchRecentXPostCounts(query: string, hours: number = 24): Promise<XRecentCountSnapshot> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('X recent-count query is empty');

  const safeHours = Math.max(2, Math.min(168, Math.floor(hours)));
  // X returns an incomplete bucket when end_time falls inside the current hour.
  // Align to the beginning of the current UTC hour so velocity compares full hours only.
  const end = new Date();
  end.setUTCMinutes(0, 0, 0);
  const start = new Date(end.getTime() - safeHours * 3_600_000);
  const params = new URLSearchParams({
    query: trimmed,
    granularity: 'hour',
    start_time: start.toISOString(),
    end_time: end.toISOString()
  });

  const payload = await xGet<{
    data?: Array<{
      start?: string;
      end?: string;
      post_count?: number | string;
      tweet_count?: number | string;
    }>;
    meta?: {
      total_post_count?: number | string;
      total_tweet_count?: number | string;
    };
  }>('/tweets/counts/recent', params);

  const buckets: XCountBucket[] = (payload.data ?? []).map((item) => ({
    start: String(item.start ?? ''),
    end: String(item.end ?? ''),
    postCount: Number(item.post_count ?? item.tweet_count ?? 0) || 0
  })).filter((item) => item.start && item.end);

  const totalFromMeta = Number(payload.meta?.total_post_count ?? payload.meta?.total_tweet_count ?? NaN);
  const totalPosts24h = Number.isFinite(totalFromMeta)
    ? totalFromMeta
    : buckets.reduce((sum, bucket) => sum + bucket.postCount, 0);

  const latestHourPosts = buckets.at(-1)?.postCount ?? 0;
  const previousHourPosts = buckets.at(-2)?.postCount ?? 0;
  const thirdHourPosts = buckets.at(-3)?.postCount ?? previousHourPosts;
  const velocityPct = previousHourPosts > 0
    ? ((latestHourPosts - previousHourPosts) / previousHourPosts) * 100
    : latestHourPosts > 0 ? 100 : 0;
  const previousVelocity = thirdHourPosts > 0
    ? ((previousHourPosts - thirdHourPosts) / thirdHourPosts) * 100
    : previousHourPosts > 0 ? 100 : 0;

  return {
    query: trimmed,
    observedAt: new Date().toISOString(),
    totalPosts24h,
    latestHourPosts,
    previousHourPosts,
    velocityPct: roundPct(velocityPct),
    accelerationPct: roundPct(velocityPct - previousVelocity),
    buckets
  };
}
