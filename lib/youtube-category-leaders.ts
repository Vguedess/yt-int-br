import { evaluateContentEligibility } from '@/lib/content-policy';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
const REGION = 'BR';
const LANGUAGE = 'pt';
const WINDOW_HOURS = 24;
const MIN_DURATION_SECONDS = 8 * 60;

export type LeaderCategoryKey = 'news-politics' | 'economia' | 'entretenimento';

export type CategoryLeader = {
  categoryKey: LeaderCategoryKey;
  categoryLabel: string;
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number;
  views: number;
  likes: number;
  comments: number;
  subscribers: number | null;
  ageHours: number;
  viewsPerHour: number;
  engagementRate: number;
  candidateCount: number;
};

export type CategoryLeaderCollection = {
  collectedAt: string;
  windowStart: string;
  windowHours: 24;
  region: 'BR';
  leaders: CategoryLeader[];
  errors: Array<{ categoryKey: LeaderCategoryKey; message: string }>;
};

type SearchItem = { id?: { videoId?: string } };
type Thumbnail = { url?: string };
type VideoItem = {
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
    thumbnails?: Record<string, Thumbnail>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: { madeForKids?: boolean };
};

type ChannelItem = {
  id?: string;
  snippet?: { title?: string; description?: string };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  status?: { madeForKids?: boolean };
};

type ListResponse<T> = { items?: T[] };

const CATEGORY_SPECS: Array<{
  key: LeaderCategoryKey;
  label: string;
  search: Record<string, string>;
  fallbackSearch?: Record<string, string>;
}> = [
  {
    key: 'news-politics',
    label: 'News & Politics',
    search: { videoCategoryId: '25' }
  },
  {
    key: 'economia',
    label: 'Economia',
    search: {
      topicId: '/m/09s1f',
      q: 'economia|mercado|inflação|juros|selic|dólar|PIB|bolsa|emprego|finanças'
    },
    fallbackSearch: { topicId: '/m/09s1f' }
  },
  {
    key: 'entretenimento',
    label: 'Entretenimento',
    search: { videoCategoryId: '24' }
  }
];

function numeric(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0;
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return numeric(days) * 86400 + numeric(hours) * 3600 + numeric(minutes) * 60 + numeric(seconds);
}

function thumbnail(thumbnails: Record<string, Thumbnail> | undefined): string | null {
  return thumbnails?.maxres?.url ?? thumbnails?.standard?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url ?? null;
}

async function youtubeFetch<T>(resource: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not configured');

  const url = new URL(`${YOUTUBE_API_ROOT}/${resource}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API ${response.status}: ${body.slice(0, 280)}`);
  }

  return (await response.json()) as T;
}

async function searchVideoIds(
  search: Record<string, string>,
  publishedAfter: string
): Promise<string[]> {
  const response = await youtubeFetch<ListResponse<SearchItem>>('search', {
    part: 'snippet',
    type: 'video',
    order: 'viewCount',
    publishedAfter,
    regionCode: REGION,
    relevanceLanguage: LANGUAGE,
    safeSearch: 'moderate',
    maxResults: '50',
    ...search
  });

  return [...new Set((response.items ?? []).map((item) => item.id?.videoId ?? '').filter(Boolean))];
}

async function getChannels(channelIds: string[]): Promise<Map<string, ChannelItem>> {
  const ids = [...new Set(channelIds.filter(Boolean))].slice(0, 50);
  if (!ids.length) return new Map();

  const response = await youtubeFetch<ListResponse<ChannelItem>>('channels', {
    part: 'snippet,statistics,status',
    id: ids.join(','),
    maxResults: '50'
  });

  return new Map((response.items ?? []).filter((item) => item.id).map((item) => [item.id!, item]));
}

async function chooseLeader(
  categoryKey: LeaderCategoryKey,
  categoryLabel: string,
  videoIds: string[]
): Promise<CategoryLeader | null> {
  if (!videoIds.length) return null;

  const response = await youtubeFetch<ListResponse<VideoItem>>('videos', {
    part: 'snippet,contentDetails,statistics,status',
    id: videoIds.slice(0, 50).join(','),
    maxResults: '50'
  });
  const videos = response.items ?? [];
  const channels = await getChannels(videos.map((video) => video.snippet?.channelId ?? ''));

  const eligible = videos.flatMap((video) => {
    const videoId = video.id;
    const title = video.snippet?.title;
    const channelId = video.snippet?.channelId;
    const channelTitle = video.snippet?.channelTitle;
    const publishedAt = video.snippet?.publishedAt;
    if (!videoId || !title || !channelId || !channelTitle || !publishedAt) return [];

    const durationSeconds = parseDurationSeconds(video.contentDetails?.duration);
    if (durationSeconds < MIN_DURATION_SECONDS) return [];

    const channel = channels.get(channelId);
    const eligibility = evaluateContentEligibility({
      videoId,
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
    if (!eligibility.allowed) return [];

    const views = numeric(video.statistics?.viewCount);
    const likes = numeric(video.statistics?.likeCount);
    const comments = numeric(video.statistics?.commentCount);
    const ageHours = Math.max(0.25, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
    const subscribers = channel?.statistics?.hiddenSubscriberCount
      ? null
      : channel?.statistics?.subscriberCount
        ? numeric(channel.statistics.subscriberCount)
        : null;

    return [{
      categoryKey,
      categoryLabel,
      videoId,
      title,
      channelId,
      channelTitle,
      thumbnailUrl: thumbnail(video.snippet?.thumbnails),
      publishedAt,
      durationSeconds,
      views,
      likes,
      comments,
      subscribers,
      ageHours,
      viewsPerHour: views / ageHours,
      engagementRate: views > 0 ? (likes + comments) / views : 0,
      candidateCount: videoIds.length
    } satisfies CategoryLeader];
  });

  return eligible.sort((a, b) => b.views - a.views || b.viewsPerHour - a.viewsPerHour)[0] ?? null;
}

export async function collectCategoryLeaders24h(): Promise<CategoryLeaderCollection> {
  const collectedAt = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString();
  const leaders: CategoryLeader[] = [];
  const errors: CategoryLeaderCollection['errors'] = [];

  for (const spec of CATEGORY_SPECS) {
    try {
      let ids = await searchVideoIds(spec.search, windowStart);
      let leader = await chooseLeader(spec.key, spec.label, ids);

      if (!leader && spec.fallbackSearch) {
        ids = await searchVideoIds(spec.fallbackSearch, windowStart);
        leader = await chooseLeader(spec.key, spec.label, ids);
      }

      if (!leader) {
        errors.push({ categoryKey: spec.key, message: 'Nenhum vídeo elegível encontrado nas últimas 24h.' });
        continue;
      }

      leaders.push(leader);
    } catch (error) {
      errors.push({
        categoryKey: spec.key,
        message: error instanceof Error ? error.message : 'Falha desconhecida ao consultar o YouTube.'
      });
    }
  }

  return {
    collectedAt,
    windowStart,
    windowHours: 24,
    region: 'BR',
    leaders,
    errors
  };
}
