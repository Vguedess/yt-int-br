import { evaluateContentEligibility } from '@/lib/content-policy';
import {
  buildTopicPulses,
  calculateRankingHomogeneity,
  diversifyVideosByTopic,
  type RankingHomogeneity,
  type TopicPulse,
  type TopicRepresentative
} from '@/lib/topic-intelligence';
import {
  NETWORK_BREAKOUT_MODEL_VERSION,
  scoreNetworkBreakoutCohort,
  type NetworkBreakoutMetrics
} from '@/lib/network-diffusion';
import { buildTopicDiffusionSignals, type TopicDiffusionSignal } from '@/lib/topic-diffusion';
import { getSocialBladeGrowthLeader, type SocialBladeGrowthLeader } from '@/lib/db';
import { isSocialBladeConfigured } from '@/lib/socialblade';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
const REGION = 'BR';
const LANGUAGE = 'pt';
const CACHE_SECONDS = 60 * 60;
const MACRO_CACHE_SECONDS = 3 * 60 * 60;
const MACRO_WINDOW_HOURS = 72;

export type MacroCategoryKey = 'politica' | 'economia' | 'entretenimento';

const MACRO_CATEGORIES: Array<{ key: MacroCategoryKey; label: string; topicId: string }> = [
  { key: 'politica', label: 'Política', topicId: '/m/05qt0' },
  { key: 'economia', label: 'Economia', topicId: '/m/09s1f' },
  { key: 'entretenimento', label: 'Entretenimento', topicId: '/m/02jjt' }
];

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

type BasePopularVideo = {
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
};

export type PopularVideo = BasePopularVideo & NetworkBreakoutMetrics;

type UnscoredPopularVideo = BasePopularVideo;

export type MacroRadar = {
  key: MacroCategoryKey;
  label: string;
  topicId: string;
  windowHours: number;
  candidateCount: number;
  videoCount: number;
  channelCount: number;
  totalViews: number;
  totalViewsPerHour: number;
  averageEngagementRate: number;
  videos: PopularVideo[];
  diffusionSignals: TopicDiffusionSignal[];
  error?: string;
};

export type CurrentPopularitySnapshot = {
  ok: boolean;
  generatedAt: string;
  region: 'BR';
  filterVersion: '2026-09-02.1';
  source: 'youtube-data-api-v3';
  networkModelVersion: typeof NETWORK_BREAKOUT_MODEL_VERSION;
  macroRadars: MacroRadar[];
  mostPopular: PopularVideo[];
  mostPopularByTopic: TopicRepresentative[];
  publishedLast24h: PopularVideo[];
  publishedLast24hByTopic: TopicRepresentative[];
  publishedLast24hBasis: 'youtube-search-plus-current-chart';
  topics: TopicPulse[];
  acceleratingTopics: TopicPulse[];
  homogeneity: RankingHomogeneity;
  channelGrowth24h: SocialBladeGrowthLeader | null;
  channelGrowthStatus: 'socialblade' | 'awaiting-socialblade-sync' | 'socialblade-not-configured';
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

async function youtubeFetch<T>(
  resource: string,
  params: Record<string, string>,
  revalidateSeconds: number = CACHE_SECONDS
): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error('YOUTUBE_API_KEY is not configured');
  }

  const url = new URL(`${YOUTUBE_API_ROOT}/${resource}`);
  for (const [keyName, value] of Object.entries({ ...params, key })) {
    url.searchParams.set(keyName, value);
  }

  const response = await fetch(url, {
    next: { revalidate: revalidateSeconds },
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

function toPopularVideo(video: YouTubeVideo, channel: YouTubeChannel | undefined): UnscoredPopularVideo | null {
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
    engagementRate
  };
}

function applyNetworkAwareScoring(items: UnscoredPopularVideo[]): PopularVideo[] {
  if (!items.length) return [];
  const metrics = scoreNetworkBreakoutCohort(items.map((item) => ({
    id: item.id,
    views: item.views,
    subscribers: item.subscribers,
    ageHours: item.ageHours,
    viewsPerHour: item.viewsPerHour,
    engagementRate: item.engagementRate
  })));

  return items.map((item) => {
    const breakout = metrics.get(item.id);
    if (!breakout) throw new Error(`Missing network breakout metrics for video ${item.id}`);
    return { ...item, ...breakout };
  });
}

function mergeUniqueVideos(...groups: PopularVideo[][]): PopularVideo[] {
  const byId = new Map<string, PopularVideo>();
  for (const group of groups) {
    for (const video of group) {
      const current = byId.get(video.id);
      if (!current || video.views > current.views) byId.set(video.id, video);
    }
  }
  return [...byId.values()];
}

async function hydrateVideos(
  videoIds: string[],
  revalidateSeconds: number = CACHE_SECONDS
): Promise<{ items: PopularVideo[]; excludedCount: number }> {
  const unique = [...new Set(videoIds.filter(Boolean))].slice(0, 50);
  if (!unique.length) return { items: [], excludedCount: 0 };

  const videoResponse = await youtubeFetch<YouTubeListResponse<YouTubeVideo>>('videos', {
    part: 'snippet,contentDetails,statistics,status',
    id: unique.join(','),
    maxResults: '50'
  }, revalidateSeconds);
  const videos = videoResponse.items ?? [];
  const channels = await getChannels(videos.map((video) => video.snippet?.channelId ?? ''));
  const eligible = videos
    .map((video) => toPopularVideo(video, channels.get(video.snippet?.channelId ?? '')))
    .filter((item): item is UnscoredPopularVideo => Boolean(item));

  return {
    items: applyNetworkAwareScoring(eligible),
    excludedCount: Math.max(0, videos.length - eligible.length)
  };
}

async function getMacroRadar(category: { key: MacroCategoryKey; label: string; topicId: string }): Promise<MacroRadar> {
  try {
    const publishedAfter = new Date(Date.now() - MACRO_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const response = await youtubeFetch<YouTubeListResponse<{ id?: { videoId?: string } }>>('search', {
      part: 'snippet',
      type: 'video',
      order: 'viewCount',
      publishedAfter,
      regionCode: REGION,
      relevanceLanguage: LANGUAGE,
      safeSearch: 'moderate',
      topicId: category.topicId,
      maxResults: '50'
    }, MACRO_CACHE_SECONDS);

    const ids = (response.items ?? []).map((item) => item.id?.videoId ?? '').filter(Boolean);
    const hydrated = await hydrateVideos(ids, MACRO_CACHE_SECONDS);
    const ranked = hydrated.items
      .sort((a, b) => b.hypeScore - a.hypeScore || b.viralForce - a.viralForce || b.viewsPerHour - a.viewsPerHour || b.views - a.views);
    const diffusionSignals = buildTopicDiffusionSignals(ranked);
    const videos = ranked.slice(0, 12);
    const totalViews = videos.reduce((sum, video) => sum + video.views, 0);
    const totalViewsPerHour = videos.reduce((sum, video) => sum + video.viewsPerHour, 0);
    const averageEngagementRate = videos.length
      ? videos.reduce((sum, video) => sum + video.engagementRate, 0) / videos.length
      : 0;

    return {
      key: category.key,
      label: category.label,
      topicId: category.topicId,
      windowHours: MACRO_WINDOW_HOURS,
      candidateCount: ids.length,
      videoCount: videos.length,
      channelCount: new Set(videos.map((video) => video.channelId)).size,
      totalViews,
      totalViewsPerHour,
      averageEngagementRate,
      videos,
      diffusionSignals
    };
  } catch (error) {
    return {
      key: category.key,
      label: category.label,
      topicId: category.topicId,
      windowHours: MACRO_WINDOW_HOURS,
      candidateCount: 0,
      videoCount: 0,
      channelCount: 0,
      totalViews: 0,
      totalViewsPerHour: 0,
      averageEngagementRate: 0,
      videos: [],
      diffusionSignals: [],
      error: error instanceof Error ? error.message : 'Unknown macro radar error'
    };
  }
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
    .filter((item): item is UnscoredPopularVideo => Boolean(item));

  return {
    items: applyNetworkAwareScoring(eligible).sort((a, b) => b.hypeScore - a.hypeScore || b.viralForce - a.viralForce),
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
    const [mostPopular, searchLast24h, ...macroRadars] = await Promise.all([
      getMostPopular(),
      getPublishedLast24h(),
      ...MACRO_CATEGORIES.map((category) => getMacroRadar(category))
    ]);

    const recentFromCurrentChart = mostPopular.items.filter((video) => video.ageHours <= 24);
    const publishedLast24h = mergeUniqueVideos(searchLast24h.items, recentFromCurrentChart)
      .filter((video) => video.ageHours <= 24)
      .sort((a, b) => b.views - a.views);

    const topicInput = mergeUniqueVideos(mostPopular.items, publishedLast24h);
    const topics = buildTopicPulses(topicInput);
    const homogeneity = calculateRankingHomogeneity(topicInput);
    const acceleratingTopics = [...topics]
      .filter((topic) => topic.stage === 'ACELERAÇÃO' || topic.stage === 'DOMINANTE')
      .sort((a, b) => b.momentumScore - a.momentumScore)
      .slice(0, 6);
    const channelGrowth24h = await getSocialBladeGrowthLeader(topicInput.map((video) => video.channelId));

    return {
      ok: true,
      generatedAt,
      region: REGION,
      filterVersion: '2026-09-02.1',
      source: 'youtube-data-api-v3',
      networkModelVersion: NETWORK_BREAKOUT_MODEL_VERSION,
      macroRadars,
      mostPopular: mostPopular.items.slice(0, 8),
      mostPopularByTopic: diversifyVideosByTopic(mostPopular.items, 'hype').slice(0, 6),
      publishedLast24h: publishedLast24h.slice(0, 8),
      publishedLast24hByTopic: diversifyVideosByTopic(publishedLast24h, 'views').slice(0, 6),
      publishedLast24hBasis: 'youtube-search-plus-current-chart',
      topics: topics.slice(0, 8),
      acceleratingTopics,
      homogeneity,
      channelGrowth24h,
      channelGrowthStatus: channelGrowth24h
        ? 'socialblade'
        : isSocialBladeConfigured()
          ? 'awaiting-socialblade-sync'
          : 'socialblade-not-configured',
      excludedCount: mostPopular.excludedCount + searchLast24h.excludedCount
    };
  } catch (error) {
    return {
      ok: false,
      generatedAt,
      region: REGION,
      filterVersion: '2026-09-02.1',
      source: 'youtube-data-api-v3',
      networkModelVersion: NETWORK_BREAKOUT_MODEL_VERSION,
      macroRadars: MACRO_CATEGORIES.map((category) => ({
        key: category.key,
        label: category.label,
        topicId: category.topicId,
        windowHours: MACRO_WINDOW_HOURS,
        candidateCount: 0,
        videoCount: 0,
        channelCount: 0,
        totalViews: 0,
        totalViewsPerHour: 0,
        averageEngagementRate: 0,
        videos: [],
        diffusionSignals: []
      })),
      mostPopular: [],
      mostPopularByTopic: [],
      publishedLast24h: [],
      publishedLast24hByTopic: [],
      publishedLast24hBasis: 'youtube-search-plus-current-chart',
      topics: [],
      acceleratingTopics: [],
      homogeneity: calculateRankingHomogeneity([]),
      channelGrowth24h: null,
      channelGrowthStatus: isSocialBladeConfigured() ? 'awaiting-socialblade-sync' : 'socialblade-not-configured',
      excludedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown popularity collector error'
    };
  }
}
