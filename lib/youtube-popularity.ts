import { evaluateContentEligibility } from '@/lib/content-policy';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
const REGION = 'BR';
const LANGUAGE = 'pt';
const CACHE_SECONDS = 60 * 60;

type YouTubeThumbnail = {
  url?: string;
  width?: number;
  height?: number;
};

type YouTubeVideo = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    categoryId?: string;
    tags?: string[];
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, YouTubeThumbnail>;
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  status?: {
    madeForKids?: boolean;
  };
};

type YouTubeChannel = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: Record<string, YouTubeThumbnail>;
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    viewCount?: string;
    videoCount?: string;
  };
  status?: {
    madeForKids?: boolean;
  };
};

type YouTubeListResponse<T> = {
  items?: T[];
};

export type PopularVideo = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl?: string;
  publishedAt: string;
  durationSeconds: number;
  views: number;
  likes: number;
  comments: number;
  subscribers: number | null;
  ageHours: number;
  viewsPerHour: number;
  engagementRate: number;
  hypeScore: number;
};

export type CurrentPopularitySnapshot = {
  ok: boolean;
  generatedAt: string;
  region: 'BR';
  filterVersion: '2026-08-19.1';
  source: 'youtube-data-api-v3';
  mostPopular: PopularVideo[];
  publishedLast24h: PopularVideo[];
  channelGrowth24h: null;
  channelGrowthStatus: 'baseline-required';
  excludedCount: number;
  error?: string;
};

function number(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIsoDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0;
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;

  const [, days, hours, minutes, seconds] = match;
  return (
    number(days) * 86_400 +
    number(hours) * 3_600 +
    number(minutes) * 60 +
    number(seconds)
  );
}

function bestThumbnail(thumbnails: Record<string, YouTubeThumbnail> | undefined): string | undefined {
  return thumbnails?.maxres?.url ?? thumbnails?.standard?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url;
}

async function youtubeFetch<T>(resource: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error('YOUTUBE_API_KEY is not configured');
  }

  const url = new URL(`${YOUTUBE_API_ROOT}/${resource}`);
  for (const [keyName, value] of Object.entries({ ...params, key })) {
    url.searchParams.set(keyName, value);
  }

  const response = await fetch(url, {
    next: { revalidate: CACHE_SECONDS },
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

async function getChannels(channelIds: string[]): Promise<Map<string, YouTubeChannel>> {
  const unique = [...new Set(channelIds.filter(Boolean))].slice(0, 50);
  if (!unique.length) return new Map();

  const response = await youtubeFetch<YouTubeListResponse<YouTubeChannel>>('channels', {
    part: 'snippet,statistics,status',
    id: unique.join(','),
    maxResults: '50'
  });

  return new Map((response.items ?? []).filter((item) => item.id).map((item) => [item.id!, item]));
}

function toPopularVideo(video: YouTubeVideo, channel: YouTubeChannel | undefined): PopularVideo | null {
  const id = video.id;
  const title = video.snippet?.title;
  const channelId = video.snippet?.channelId;
  const channelTitle = video.snippet?.channelTitle;
  const publishedAt = video.snippet?.publishedAt;
  if (!id || !title || !channelId || !channelTitle || !publishedAt) return null;

  const durationSeconds = parseIsoDurationSeconds(video.contentDetails?.duration);
  const eligibility = evaluateContentEligibility({
    videoId: id,
    title,
    description: video.snippet?.description,
    tags: video.snippet?.tags,
    categoryId: video.snippet?.categoryId,
    durationSeconds,
    liveBroadcastContent: video.snippet?.liveBroadcastContent,
    madeForKids: video.status?.madeForKids,
    channelTitle,
    channelDescription: channel?.snippet?.description,
    channelMadeForKids: channel?.status?.madeForKids
  });

  if (!eligibility.allowed) return null;

  const views = number(video.statistics?.viewCount);
  const likes = number(video.statistics?.likeCount);
  const comments = number(video.statistics?.commentCount);
  const subscribers = channel?.statistics?.hiddenSubscriberCount
    ? null
    : channel?.statistics?.subscriberCount
      ? number(channel.statistics.subscriberCount)
      : null;
  const ageHours = Math.max(0.25, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
  const viewsPerHour = views / ageHours;
  const engagementRate = views > 0 ? (likes + comments) / views : 0;

  return {
    id,
    title,
    channelId,
    channelTitle,
    thumbnailUrl: bestThumbnail(video.snippet?.thumbnails),
    publishedAt,
    durationSeconds,
    views,
    likes,
    comments,
    subscribers,
    ageHours,
    viewsPerHour,
    engagementRate,
    hypeScore: 0
  };
}

function applyRelativeHypeScore(items: PopularVideo[]): PopularVideo[] {
  if (!items.length) return [];
  const raw = items.map((item) => {
    const velocity = Math.log10(item.viewsPerHour + 1);
    const engagement = Math.min(item.engagementRate, 0.12) * 16;
    const recency = 1 / Math.sqrt(Math.max(item.ageHours, 1) / 12);
    return velocity * 1.8 + engagement + recency;
  });
  const min = Math.min(...raw);
  const max = Math.max(...raw);

  return items.map((item, index) => ({
    ...item,
    hypeScore: max === min ? 100 : Math.round(55 + ((raw[index] - min) / (max - min)) * 45)
  }));
}

async function hydrateVideos(videoIds: string[]): Promise<{ items: PopularVideo[]; excludedCount: number }> {
  const unique = [...new Set(videoIds.filter(Boolean))].slice(0, 50);
  if (!unique.length) return { items: [], excludedCount: 0 };

  const videoResponse = await youtubeFetch<YouTubeListResponse<YouTubeVideo>>('videos', {
    part: 'snippet,contentDetails,statistics,status',
    id: unique.join(','),
    maxResults: '50'
  });
  const videos = videoResponse.items ?? [];
  const channels = await getChannels(videos.map((video) => video.snippet?.channelId ?? ''));
  const eligible = videos
    .map((video) => toPopularVideo(video, channels.get(video.snippet?.channelId ?? '')))
    .filter((item): item is PopularVideo => Boolean(item));

  return {
    items: applyRelativeHypeScore(eligible),
    excludedCount: Math.max(0, videos.length - eligible.length)
  };
}

async function getMostPopular(): Promise<{ items: PopularVideo[]; excludedCount: number }> {
  const response = await youtubeFetch<YouTubeListResponse<YouTubeVideo>>('videos', {
    part: 'snippet,contentDetails,statistics,status',
    chart: 'mostPopular',
    regionCode: REGION,
    maxResults: '50'
  });

  const videos = response.items ?? [];
  const channels = await getChannels(videos.map((video) => video.snippet?.channelId ?? ''));
  const eligible = videos
    .map((video) => toPopularVideo(video, channels.get(video.snippet?.channelId ?? '')))
    .filter((item): item is PopularVideo => Boolean(item));

  return {
    items: applyRelativeHypeScore(eligible).sort((a, b) => b.hypeScore - a.hypeScore),
    excludedCount: Math.max(0, videos.length - eligible.length)
  };
}

async function getPublishedLast24h(): Promise<{ items: PopularVideo[]; excludedCount: number }> {
  const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const response = await youtubeFetch<YouTubeListResponse<{ id?: { videoId?: string } }>>('search', {
    part: 'snippet',
    type: 'video',
    order: 'viewCount',
    publishedAfter,
    regionCode: REGION,
    relevanceLanguage: LANGUAGE,
    safeSearch: 'moderate',
    maxResults: '50'
  });

  const videoIds = (response.items ?? []).map((item) => item.id?.videoId ?? '').filter(Boolean);
  const hydrated = await hydrateVideos(videoIds);
  hydrated.items.sort((a, b) => b.views - a.views);
  return hydrated;
}

export async function getCurrentPopularity(): Promise<CurrentPopularitySnapshot> {
  const generatedAt = new Date().toISOString();
  try {
    const [mostPopular, publishedLast24h] = await Promise.all([
      getMostPopular(),
      getPublishedLast24h()
    ]);

    return {
      ok: true,
      generatedAt,
      region: REGION,
      filterVersion: '2026-08-19.1',
      source: 'youtube-data-api-v3',
      mostPopular: mostPopular.items.slice(0, 8),
      publishedLast24h: publishedLast24h.items.slice(0, 8),
      channelGrowth24h: null,
      channelGrowthStatus: 'baseline-required',
      excludedCount: mostPopular.excludedCount + publishedLast24h.excludedCount
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      region: REGION,
      filterVersion: '2026-08-19.1',
      source: 'youtube-data-api-v3',
      mostPopular: [],
      publishedLast24h: [],
      channelGrowth24h: null,
      channelGrowthStatus: 'baseline-required',
      excludedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown popularity collector error'
    };
  }
}
