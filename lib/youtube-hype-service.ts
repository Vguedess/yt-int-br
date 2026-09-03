import {
  getLatestHistoricalHypeVideos,
  getLatestManualHypeSnapshot
} from '@/lib/youtube-history-db';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';

type Thumbnail = { url?: string };
type YouTubeVideo = {
  id?: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, Thumbnail>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};
type YouTubeChannel = {
  id?: string;
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
};
type YouTubeListResponse<T> = { items?: T[] };

export type HypeVideoCard = {
  rank: number;
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string | null;
  observedHour: string;
  subscribers: number | null;
  thumbnailUrl: string;
  durationSeconds: number | null;
  currentViews: number;
  sourceKind: 'youtube-hype-manual' | 'model-hype';
  hypeScore: number | null;
  networkEscape: number | null;
  breakoutStrength: number | null;
  viralForce: number | null;
  nodeTier: string | null;
};

export type HypeDashboard = {
  market: 'BR';
  observedHour: string | null;
  videos: HypeVideoCard[];
  source:
    | 'youtube-hype-manual-plus-youtube-hydration'
    | 'youtube-hype-manual'
    | 'neon-history-plus-youtube-hydration'
    | 'neon-history-only'
    | 'no-history';
  sourceLabel?: string;
  filters?: string[];
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

async function youtubeFetch<T>(resource: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured');

  const url = new URL(`${YOUTUBE_API_ROOT}/${resource}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube ${resource} ${response.status}: ${body.slice(0, 220)}`);
  }
  return await response.json() as T;
}

async function hydrateVideoMetadata(videoIds: string[]): Promise<{
  videos: Map<string, YouTubeVideo>;
  channels: Map<string, YouTubeChannel>;
}> {
  const ids = [...new Set(videoIds)].filter(Boolean);
  if (!ids.length) return { videos: new Map(), channels: new Map() };

  const videoPayload = await youtubeFetch<YouTubeListResponse<YouTubeVideo>>('videos', {
    part: 'snippet,contentDetails,statistics',
    id: ids.join(','),
    maxResults: '50'
  });
  const videoItems = videoPayload.items ?? [];
  const channelIds = [...new Set(videoItems.map((item) => item.snippet?.channelId ?? '').filter(Boolean))];
  const channelPayload = channelIds.length
    ? await youtubeFetch<YouTubeListResponse<YouTubeChannel>>('channels', {
        part: 'statistics',
        id: channelIds.join(','),
        maxResults: '50'
      })
    : { items: [] };

  return {
    videos: new Map(videoItems.filter((item) => item.id).map((item) => [item.id!, item])),
    channels: new Map((channelPayload.items ?? []).filter((item) => item.id).map((item) => [item.id!, item]))
  };
}

function subscriberCount(channel: YouTubeChannel | undefined): number | null {
  if (!channel || channel.statistics?.hiddenSubscriberCount) return null;
  return channel.statistics?.subscriberCount ? numeric(channel.statistics.subscriberCount) : null;
}

export async function getHypeDashboard(): Promise<HypeDashboard> {
  const manual = await getLatestManualHypeSnapshot('BR');
  if (manual?.videoIds.length) {
    let hydrated = { videos: new Map<string, YouTubeVideo>(), channels: new Map<string, YouTubeChannel>() };
    let apiWarning: string | undefined;
    try {
      hydrated = await hydrateVideoMetadata(manual.videoIds);
    } catch (error) {
      apiWarning = error instanceof Error ? error.message : 'Falha ao hidratar ranking Hype do YouTube.';
    }

    const videos = manual.videoIds.map((videoId, index) => {
      const current = hydrated.videos.get(videoId);
      const channelId = current?.snippet?.channelId ?? '';
      const channel = hydrated.channels.get(channelId);
      return {
        rank: index + 1,
        videoId,
        channelId,
        channelTitle: current?.snippet?.channelTitle ?? 'Canal indisponível',
        title: current?.snippet?.title ?? `Vídeo ${videoId}`,
        publishedAt: current?.snippet?.publishedAt ?? null,
        observedHour: manual.observedAt,
        subscribers: subscriberCount(channel),
        thumbnailUrl: bestThumbnail(videoId, current?.snippet?.thumbnails),
        durationSeconds: parseDurationSeconds(current?.contentDetails?.duration),
        currentViews: current?.statistics?.viewCount ? numeric(current.statistics.viewCount) : 0,
        sourceKind: 'youtube-hype-manual',
        hypeScore: null,
        networkEscape: null,
        breakoutStrength: null,
        viralForce: null,
        nodeTier: null
      } satisfies HypeVideoCard;
    });

    return {
      market: 'BR',
      observedHour: manual.observedAt,
      videos,
      source: hydrated.videos.size ? 'youtube-hype-manual-plus-youtube-hydration' : 'youtube-hype-manual',
      sourceLabel: manual.source,
      filters: manual.filters,
      apiWarning
    };
  }

  const history = await getLatestHistoricalHypeVideos(4);
  if (!history.videos.length) {
    return { market: 'BR', observedHour: history.observedHour, videos: [], source: 'no-history' };
  }

  let hydrated = { videos: new Map<string, YouTubeVideo>(), channels: new Map<string, YouTubeChannel>() };
  let apiWarning: string | undefined;
  try {
    hydrated = await hydrateVideoMetadata(history.videos.map((video) => video.videoId));
  } catch (error) {
    apiWarning = error instanceof Error ? error.message : 'Falha ao hidratar os vídeos atuais do YouTube.';
  }

  const videos = history.videos.map((video, index) => {
    const current = hydrated.videos.get(video.videoId);
    return {
      rank: index + 1,
      videoId: video.videoId,
      channelId: video.channelId,
      channelTitle: current?.snippet?.channelTitle ?? video.channelTitle,
      title: current?.snippet?.title ?? video.title,
      publishedAt: current?.snippet?.publishedAt ?? video.publishedAt,
      observedHour: video.observedHour,
      subscribers: video.subscribers,
      thumbnailUrl: bestThumbnail(video.videoId, current?.snippet?.thumbnails),
      durationSeconds: parseDurationSeconds(current?.contentDetails?.duration),
      currentViews: current?.statistics?.viewCount ? numeric(current.statistics.viewCount) : video.views,
      sourceKind: 'model-hype',
      hypeScore: video.hypeScore,
      networkEscape: video.networkEscape,
      breakoutStrength: video.breakoutStrength,
      viralForce: video.viralForce,
      nodeTier: video.nodeTier
    } satisfies HypeVideoCard;
  });

  return {
    market: 'BR',
    observedHour: history.observedHour,
    videos,
    source: hydrated.videos.size ? 'neon-history-plus-youtube-hydration' : 'neon-history-only',
    apiWarning
  };
}
