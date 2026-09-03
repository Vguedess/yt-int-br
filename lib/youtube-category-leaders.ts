import { evaluateContentEligibility } from '@/lib/content-policy';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
const REGION = 'BR';
const LANGUAGE = 'pt';
const WINDOW_HOURS = 24;
const MIN_DURATION_SECONDS = 8 * 60;

export type LeaderCategoryKey = 'news-politics' | 'science-tech' | 'economia' | 'entretenimento';

export type CategoryLeader = {
  categoryKey: LeaderCategoryKey;
  categoryLabel: string;
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  channelCountry: string | null;
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
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    thumbnails?: Record<string, Thumbnail>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: { madeForKids?: boolean };
};

type ChannelItem = {
  id?: string;
  snippet?: { title?: string; description?: string; country?: string };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  status?: { madeForKids?: boolean };
};

type ListResponse<T> = { items?: T[] };

type CategorySpec = {
  key: LeaderCategoryKey;
  label: string;
  search: Record<string, string>;
  fallbackSearch?: Record<string, string>;
};

const CATEGORY_SPECS: CategorySpec[] = [
  {
    key: 'news-politics',
    label: 'Notícias e Política',
    search: { videoCategoryId: '25' },
    fallbackSearch: {
      q: 'política|eleições|governo|congresso|senado|STF|TSE|presidente|Lula|Bolsonaro'
    }
  },
  {
    key: 'science-tech',
    label: 'Ciência e Tecnologia',
    search: { videoCategoryId: '28' },
    fallbackSearch: {
      q: 'ciência|tecnologia|inteligência artificial|IA|computação|espaço|astronomia|física|biologia|inovação'
    }
  },
  {
    key: 'economia',
    label: 'Economia / Mercados',
    search: {
      topicId: '/m/09s1f',
      q: 'economia|inflação|juros|selic|dólar|PIB|ibovespa|finanças|Banco Central|impostos'
    },
    fallbackSearch: {
      q: 'economia|inflação|juros|selic|dólar|PIB|ibovespa|finanças|Banco Central|impostos'
    }
  },
  {
    key: 'entretenimento',
    label: 'Entretenimento',
    search: { videoCategoryId: '24' },
    fallbackSearch: {
      q: 'filme|série|cinema|celebridade|TV|cultura pop|entretenimento'
    }
  }
];

const ECONOMY_POSITIVE_MARKERS = [
  'economia', 'economico', 'economica', 'inflacao', 'juros', 'selic', 'dolar', 'pib', 'ibovespa',
  'financas', 'financeiro', 'financeira', 'banco central', 'imposto', 'tributaria', 'tributario',
  'recessao', 'divida publica', 'fiscal', 'orcamento', 'emprego', 'desemprego', 'salario', 'renda',
  'investimento', 'investimentos', 'bolsa de valores', 'petroleo', 'commodities', 'tarifa', 'copom'
];

const ECONOMY_NEGATIVE_MARKERS = [
  'mercado de transfer', 'janela de transfer', 'contratacao', 'contratação', 'futebol', 'jogador',
  'real madrid', 'barcelona', 'premier league', 'la liga', 'champions', 'transfermarkt', 'fichaje',
  'ultimo dia de mercado', 'último dia de mercado'
];

const PORTUGUESE_BRAZIL_MARKERS = [
  'brasil', 'brasileiro', 'brasileira', 'não', 'nao', 'está', 'esta', 'sobre', 'hoje', 'agora',
  'governo', 'eleição', 'eleicao', 'eleições', 'eleicoes', 'economia', 'juros', 'dólar', 'dolar',
  'ciência', 'ciencia', 'tecnologia', 'filme', 'série', 'serie', 'cinema', 'notícia', 'noticia',
  'notícias', 'noticias', 'com', 'para'
];

const ENTERTAINMENT_STREAM_MARKERS = [
  ' is live ', ' live for ', ' livestream', 'live stream', 'streaming now', 'ao vivo', ' transmissão ao vivo',
  ' transmissao ao vivo'
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(value: string, markers: string[]): boolean {
  const normalized = ` ${normalize(value)} `;
  return markers.some((marker) => normalized.includes(` ${normalize(marker)} `) || normalized.includes(normalize(marker)));
}

function isEconomyContext(video: VideoItem): boolean {
  const text = `${video.snippet?.title ?? ''} ${video.snippet?.description ?? ''}`;
  if (hasAny(text, ECONOMY_NEGATIVE_MARKERS)) return false;
  return hasAny(text, ECONOMY_POSITIVE_MARKERS);
}

function isBrazilianLocale(video: VideoItem, channel: ChannelItem | undefined): boolean {
  const country = channel?.snippet?.country?.toUpperCase();
  if (country === 'BR') return true;
  if (country && country !== 'BR') return false;

  const language = (video.snippet?.defaultAudioLanguage ?? video.snippet?.defaultLanguage ?? '').toLowerCase();
  if (language === 'pt' || language.startsWith('pt-')) return true;

  const text = `${video.snippet?.title ?? ''} ${video.snippet?.description ?? ''} ${channel?.snippet?.description ?? ''}`;
  return hasAny(text, PORTUGUESE_BRAZIL_MARKERS);
}

function isGenericEntertainmentStream(video: VideoItem): boolean {
  const title = ` ${video.snippet?.title ?? ''} `;
  return hasAny(title, ENTERTAINMENT_STREAM_MARKERS);
}

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

async function searchByDuration(
  search: Record<string, string>,
  publishedAfter: string,
  videoDuration: 'medium' | 'long'
): Promise<string[]> {
  const response = await youtubeFetch<ListResponse<SearchItem>>('search', {
    part: 'snippet',
    type: 'video',
    order: 'viewCount',
    publishedAfter,
    regionCode: REGION,
    relevanceLanguage: LANGUAGE,
    safeSearch: 'moderate',
    videoDuration,
    maxResults: '50',
    ...search
  });

  return (response.items ?? []).map((item) => item.id?.videoId ?? '').filter(Boolean);
}

async function searchVideoIds(
  search: Record<string, string>,
  publishedAfter: string
): Promise<string[]> {
  const [medium, long] = await Promise.all([
    searchByDuration(search, publishedAfter, 'medium'),
    searchByDuration(search, publishedAfter, 'long')
  ]);
  return [...new Set([...medium, ...long])].slice(0, 100);
}

async function getChannels(channelIds: string[]): Promise<Map<string, ChannelItem>> {
  const ids = [...new Set(channelIds.filter(Boolean))];
  const result = new Map<string, ChannelItem>();

  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    if (!batch.length) continue;
    const response = await youtubeFetch<ListResponse<ChannelItem>>('channels', {
      part: 'snippet,statistics,status',
      id: batch.join(','),
      maxResults: '50'
    });
    for (const item of response.items ?? []) {
      if (item.id) result.set(item.id, item);
    }
  }

  return result;
}

async function getVideos(videoIds: string[]): Promise<VideoItem[]> {
  const result: VideoItem[] = [];
  for (let offset = 0; offset < videoIds.length; offset += 50) {
    const batch = videoIds.slice(offset, offset + 50);
    if (!batch.length) continue;
    const response = await youtubeFetch<ListResponse<VideoItem>>('videos', {
      part: 'snippet,contentDetails,statistics,status',
      id: batch.join(','),
      maxResults: '50'
    });
    result.push(...(response.items ?? []));
  }
  return result;
}

async function chooseLeader(
  categoryKey: LeaderCategoryKey,
  categoryLabel: string,
  videoIds: string[]
): Promise<CategoryLeader | null> {
  if (!videoIds.length) return null;

  const videos = await getVideos(videoIds);
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
    if (!isBrazilianLocale(video, channel)) return [];
    if (categoryKey === 'economia' && !isEconomyContext(video)) return [];
    if (categoryKey === 'entretenimento' && isGenericEntertainmentStream(video)) return [];

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
      channelCountry: channel?.snippet?.country?.toUpperCase() ?? null,
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
        errors.push({
          categoryKey: spec.key,
          message: `Nenhum vídeo brasileiro long-form elegível entre ${ids.length} candidatos das últimas 24h.`
        });
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
