import { getLatestHistoricalHypeVideos, type HistoricalHypeVideo } from '@/lib/youtube-history-db';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';

type Thumbnail = { url?: string };
type YouTubeVideo = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, Thumbnail>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

type YouTubeListResponse<T> = { items?: T[] };

export type HypeVideoCard = HistoricalHypeVideo & {
  rank: number;
  thumbnailUrl: string;
  durationSeconds: number | null;
  currentViews: number;
};

export type HypeDashboard = {
  market: 'BR';
  observedHour: string | null;
  videos: HypeVideoCard[];
  source: 'neon-history-plus-youtube-hydration' | 'neon-history-only' | 'no-history';
  apiWarning?: string;
};

function numeric(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return numeric(days) * 86400 + numeric(hours) * 3600 + numeric(minutes) * 60 + numeric(seconds);
}

function bestThumbnail(videoId: string, thumbnails?: Record<string, Thumbnail>): string {
  return thumbnails?.maxres?.url
    ?? thumbnails?.standard?.url
    ?? thumbnails?.high?.url
    ?? thumbnails?.medium?.url
    ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

async function hydrateVideoMetadata(videoIds: string[]): Promise<Map<string, YouTubeVideo>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || !videoIds.length) return new Map();

  const url = new URL(`${YOUTUBE_API_ROOT}/videos`);
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', [...new Set(videoIds)].join(','));
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube videos.list ${response.status}: ${body.slice(0, 220)}`);
  }

  const payload = await response.json() as YouTubeListResponse<YouTubeVideo>;
  return new Map((payload.items ?? []).filter((item) => item.id).map((item) => [item.id!, item]));
}

export async function getHypeDashboard(): Promise<HypeDashboard> {
  const history = await getLatestHistoricalHypeVideos(4);
  if (!history.videos.length) {
    return {
      market: 'BR',
      observedHour: history.observedHour,
      videos: [],
      source: 'no-history'
    };
  }

  let hydrated = new Map<string, YouTubeVideo>();
  let apiWarning: string | undefined;
  try {
    hydrated = await hydrateVideoMetadata(history.videos.map((video) => video.videoId));
  } catch (error) {
    apiWarning = error instanceof Error ? error.message : 'Falha ao hidratar os vídeos atuais do YouTube.';
  }

  const videos = history.videos.map((video, index) => {
    const current = hydrated.get(video.videoId);
    return {
      ...video,
      rank: index + 1,
      title: current?.snippet?.title ?? video.title,
      channelTitle: current?.snippet?.channelTitle ?? video.channelTitle,
      publishedAt: current?.snippet?.publishedAt ?? video.publishedAt,
      thumbnailUrl: bestThumbnail(video.videoId, current?.snippet?.thumbnails),
      durationSeconds: parseDurationSeconds(current?.contentDetails?.duration),
      currentViews: current?.statistics?.viewCount ? numeric(current.statistics.viewCount) : video.views
    } satisfies HypeVideoCard;
  });

  return {
    market: 'BR',
    observedHour: history.observedHour,
    videos,
    source: hydrated.size ? 'neon-history-plus-youtube-hydration' : 'neon-history-only',
    apiWarning
  };
}
