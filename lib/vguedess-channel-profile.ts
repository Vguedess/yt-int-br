import type { XEnrichedTopic, XEnrichedTopicRanking } from '@/lib/x-topic-service';

const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
export const VGUEDESS_HANDLE = '@vguedess' as const;

export type VguedessInterest = {
  key: string;
  label: string;
  weight: number;
  keywords: string[];
  preferredFormat: string;
};

export const VGUEDESS_INTERESTS: VguedessInterest[] = [
  {
    key: 'politica-institucional',
    label: 'Política e instituições brasileiras',
    weight: 100,
    keywords: [
      'stf', 'supremo', 'pgr', 'senado', 'congresso', 'camara', 'câmara', 'governo',
      'judiciario', 'judiciário', 'alexandre de moraes', 'toffoli', 'constituicao', 'constituição',
      'inss', 'banco master', 'politica brasileira', 'política brasileira'
    ],
    preferredFormat: 'Análise explicativa com cronologia, documentos e contrapontos'
  },
  {
    key: 'eleicoes-movimentos',
    label: 'Eleições, movimentos e estratégia pública',
    weight: 98,
    keywords: [
      'eleicao', 'eleição', 'eleicoes', 'eleições', 'candidato', 'presidencia', 'presidência',
      'partido missao', 'partido missão', 'missao', 'missão', 'mbl', 'renan santos', 'kim kataguiri',
      'nikolas ferreira', 'tarcisio', 'tarcísio', 'lula', 'bolsonaro'
    ],
    preferredFormat: 'Perfil, trajetória ou análise factual de estratégia e cenário'
  },
  {
    key: 'seguranca-publica',
    label: 'Segurança pública e justiça',
    weight: 90,
    keywords: [
      'seguranca publica', 'segurança pública', 'crime', 'criminalidade', 'policia', 'polícia',
      'prisao', 'prisão', 'violencia', 'violência', 'justica', 'justiça', 'penal'
    ],
    preferredFormat: 'Explicador orientado por evidências, dados e efeitos de política pública'
  },
  {
    key: 'economia-mercados',
    label: 'Economia, mercados e sistema financeiro',
    weight: 88,
    keywords: [
      'economia', 'mercado', 'mercados', 'banco', 'banco central', 'selic', 'copom', 'inflacao',
      'inflação', 'fiscal', 'sistema financeiro', 'regulacao financeira', 'regulação financeira'
    ],
    preferredFormat: 'Explicador com números, contexto e consequências práticas'
  },
  {
    key: 'tecnologia-ia',
    label: 'Tecnologia, IA e inovação',
    weight: 84,
    keywords: [
      'ia', 'inteligencia artificial', 'inteligência artificial', 'openai', 'tecnologia', 'inovacao',
      'inovação', 'neurotech', 'automacao', 'automação', 'startup'
    ],
    preferredFormat: 'Vídeo-ensaio explicativo com demonstrações e implicações'
  },
  {
    key: 'ciencia-ideias',
    label: 'Ciência, estudos, história e ideias',
    weight: 76,
    keywords: [
      'ciencia', 'ciência', 'estudo', 'pesquisa', 'historia', 'história', 'filosofia', 'economia comportamental',
      'psicologia', 'documentario', 'documentário'
    ],
    preferredFormat: 'Vídeo-ensaio narrativo com pergunta central e evidências'
  },
  {
    key: 'cultura-sociedade',
    label: 'Cultura, cinema e sociedade',
    weight: 62,
    keywords: ['cinema', 'filme', 'filmes', 'serie', 'série', 'cultura', 'sociedade', 'livro', 'entretenimento'],
    preferredFormat: 'Ensaio cultural conectado a uma ideia maior'
  }
];

export const VGUEDESS_EDITORIAL_BENCHMARKS = [
  'Renan Santos',
  'IMPERA',
  'Novos Clássicos',
  'Kim Kataguiri',
  'Guto Zacarias'
] as const;

type YouTubeChannel = {
  id?: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
};

type PlaylistItem = {
  snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
};

type YouTubeVideo = {
  id?: string;
  snippet?: { title?: string; publishedAt?: string };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
};

type ListResponse<T> = { items?: T[] };

export type VguedessRecentVideo = {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  durationSeconds: number | null;
};

export type VguedessChannelProfile = {
  handle: typeof VGUEDESS_HANDLE;
  channelId: string;
  title: string;
  subscribers: number | null;
  totalViews: number;
  videoCount: number;
  recentVideos: VguedessRecentVideo[];
  fetchedAt: string;
  warning: string | null;
};

export type VguedessTopicDecision = XEnrichedTopic & {
  marketRank: number;
  personalizedRank: number;
  interestFitScore: number;
  fatiguePenalty: number;
  freshnessScore: number;
  personalizedOpportunityScore: number;
  matchedInterest: string | null;
  preferredFormat: string;
  recentOverlapCount: number;
  decision: 'PRIORIDADE_ALTA' | 'CONSIDERAR' | 'OBSERVAR' | 'EVITAR_REPETICAO' | 'FORA_DO_FOCO';
  timingLabel: string;
  positiveReasons: string[];
  cautionReasons: string[];
};

export type VguedessPersonalizedRanking = {
  generatedAt: string;
  channelProfileAvailable: boolean;
  topics: VguedessTopicDecision[];
};

function numeric(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return numeric(days) * 86400 + numeric(hours) * 3600 + numeric(minutes) * 60 + numeric(seconds);
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

export async function getVguedessChannelProfile(): Promise<VguedessChannelProfile | null> {
  try {
    const channelPayload = await youtubeFetch<ListResponse<YouTubeChannel>>('channels', {
      part: 'snippet,contentDetails,statistics',
      forHandle: 'vguedess',
      maxResults: '1'
    });
    const channel = channelPayload.items?.[0];
    if (!channel?.id) return null;

    const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
    let recentVideos: VguedessRecentVideo[] = [];
    let warning: string | null = null;

    if (uploads) {
      try {
        const playlist = await youtubeFetch<ListResponse<PlaylistItem>>('playlistItems', {
          part: 'snippet,contentDetails',
          playlistId: uploads,
          maxResults: '30'
        });
        const ids = (playlist.items ?? [])
          .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '')
          .filter(Boolean);

        if (ids.length) {
          const videosPayload = await youtubeFetch<ListResponse<YouTubeVideo>>('videos', {
            part: 'snippet,contentDetails,statistics',
            id: ids.join(','),
            maxResults: '50'
          });
          recentVideos = (videosPayload.items ?? [])
            .filter((video): video is YouTubeVideo & { id: string } => Boolean(video.id && video.snippet?.publishedAt))
            .map((video) => ({
              videoId: video.id,
              title: video.snippet?.title ?? 'Sem título',
              publishedAt: video.snippet!.publishedAt!,
              views: numeric(video.statistics?.viewCount),
              durationSeconds: parseDurationSeconds(video.contentDetails?.duration)
            }))
            .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : 'Falha ao carregar uploads recentes.';
      }
    }

    return {
      handle: VGUEDESS_HANDLE,
      channelId: channel.id,
      title: channel.snippet?.title ?? VGUEDESS_HANDLE,
      subscribers: channel.statistics?.hiddenSubscriberCount ? null : numeric(channel.statistics?.subscriberCount),
      totalViews: numeric(channel.statistics?.viewCount),
      videoCount: numeric(channel.statistics?.videoCount),
      recentVideos,
      fetchedAt: new Date().toISOString(),
      warning
    };
  } catch {
    return null;
  }
}

function topicText(topic: XEnrichedTopic): string {
  return normalize(`${topic.label} ${topic.tags.join(' ')}`);
}

function hasKeyword(haystack: string, keyword: string): boolean {
  const needle = normalize(keyword);
  if (!needle) return false;
  if (needle.includes(' ')) return haystack.includes(needle);
  return new Set(haystack.split(' ').filter(Boolean)).has(needle);
}

function matchingInterest(topic: XEnrichedTopic): VguedessInterest | null {
  const haystack = topicText(topic);
  const matches = VGUEDESS_INTERESTS.filter((interest) =>
    interest.keywords.some((keyword) => hasKeyword(haystack, keyword))
  );
  return matches.sort((a, b) => b.weight - a.weight)[0] ?? null;
}

function topicNeedles(topic: XEnrichedTopic): string[] {
  const generic = new Set(['politica', 'brasileira', 'analise', 'economia', 'mercados', 'cultura', 'entretenimento']);
  return [...new Set([topic.label, ...topic.tags]
    .flatMap((value) => normalize(value).split(' '))
    .filter((value) => value.length >= 4 && !generic.has(value)))];
}

function recentTopicOverlap(topic: XEnrichedTopic, profile: VguedessChannelProfile | null): {
  count: number;
  penalty: number;
} {
  if (!profile?.recentVideos.length) return { count: 0, penalty: 0 };
  const needles = topicNeedles(topic);
  if (!needles.length) return { count: 0, penalty: 0 };

  let weighted = 0;
  let count = 0;
  const now = Date.now();
  for (const video of profile.recentVideos) {
    const title = normalize(video.title);
    const matched = needles.filter((needle) => new Set(title.split(' ')).has(needle)).length;
    const similarity = matched / Math.max(1, Math.min(needles.length, 5));
    if (similarity < 0.2) continue;
    count += 1;
    const ageDays = Math.max(0, (now - new Date(video.publishedAt).getTime()) / 86_400_000);
    const recency = Math.exp(-ageDays / 14);
    weighted += Math.min(1, similarity * 2.5) * recency;
  }

  return { count, penalty: Math.min(55, Math.round(weighted * 26)) };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function timingFor(topic: XEnrichedTopic): string {
  if (topic.saturationScore >= 72) return 'Só vale com ângulo claramente diferente';
  if (topic.stage === 'BREAKOUT' || topic.stage === 'ACELERACAO') return 'Janela curta: pesquisar e produzir rápido';
  if (topic.stage === 'EM_ALTA') return 'Bom momento, mas monitore a entrada de concorrentes';
  return 'Observar antes de comprometer produção';
}

export function personalizeRankingForVguedess(
  ranking: XEnrichedTopicRanking,
  profile: VguedessChannelProfile | null
): VguedessPersonalizedRanking {
  const scored = ranking.topics.map((topic): Omit<VguedessTopicDecision, 'personalizedRank'> => {
    const interest = matchingInterest(topic);
    const interestFitScore = interest?.weight ?? 28;
    const overlap = recentTopicOverlap(topic, profile);
    const fatiguePenalty = overlap.penalty;
    const freshnessScore = clamp(100 - fatiguePenalty);

    // The market creates candidates, but fit is intentionally a strong utility/constraint layer.
    // This prevents a generic viral topic from dominating the personalized ranking solely on demand.
    const base = topic.opportunityScore * 0.52 + interestFitScore * 0.36 + freshnessScore * 0.12;
    const personalizedOpportunityScore = clamp(base - fatiguePenalty * 0.45);

    let decision: VguedessTopicDecision['decision'] = 'OBSERVAR';
    if (interestFitScore < 45) decision = 'FORA_DO_FOCO';
    else if (fatiguePenalty >= 36 && personalizedOpportunityScore < 82) decision = 'EVITAR_REPETICAO';
    else if (personalizedOpportunityScore >= 74 && interestFitScore >= 75 && topic.saturationScore < 60) decision = 'PRIORIDADE_ALTA';
    else if (personalizedOpportunityScore >= 60 && topic.saturationScore < 76) decision = 'CONSIDERAR';

    const positiveReasons: string[] = [];
    const cautionReasons: string[] = [];
    if (topic.opportunityScore >= 70) positiveReasons.push(`Mercado forte: oportunidade ${topic.opportunityScore}/100`);
    if (topic.momentumScore >= 70) positiveReasons.push(`Momentum alto: ${topic.momentumScore}/100`);
    if (topic.breakoutScore >= 70) positiveReasons.push(`Sinal de breakout: ${topic.breakoutScore}/100`);
    if (interestFitScore >= 80) positiveReasons.push(`Alta aderência aos interesses editoriais: ${interestFitScore}/100`);
    if (topic.saturationScore <= 35) positiveReasons.push(`Baixa saturação no universo observado: ${topic.saturationScore}/100`);
    if (topic.xSignal.xMomentumScore != null && topic.xSignal.xMomentumScore >= 65) {
      positiveReasons.push(`X Momentum relevante: ${topic.xSignal.xMomentumScore}/100`);
    }

    if (fatiguePenalty >= 20) cautionReasons.push(`Possível repetição no canal: penalidade ${fatiguePenalty}/55`);
    if (topic.saturationScore >= 60) cautionReasons.push(`Saturação já elevada: ${topic.saturationScore}/100`);
    if (interestFitScore < 75) cautionReasons.push('Aderência moderada ou baixa: não elevar a prioridade só porque o mercado está forte');
    if (!profile) cautionReasons.push('Histórico recente do canal indisponível; fadiga não pôde ser medida');
    if (!positiveReasons.length) positiveReasons.push('Tema ainda em observação; não há sinal forte isolado suficiente');

    return {
      ...topic,
      marketRank: topic.rank,
      interestFitScore,
      fatiguePenalty,
      freshnessScore,
      personalizedOpportunityScore,
      matchedInterest: interest?.label ?? null,
      preferredFormat: interest?.preferredFormat ?? 'Só produzir se houver conexão editorial clara com o canal',
      recentOverlapCount: overlap.count,
      decision,
      timingLabel: timingFor(topic),
      positiveReasons,
      cautionReasons
    };
  });

  const topics = scored
    .sort((a, b) => b.personalizedOpportunityScore - a.personalizedOpportunityScore || b.opportunityScore - a.opportunityScore)
    .map((topic, index) => ({ ...topic, personalizedRank: index + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    channelProfileAvailable: Boolean(profile),
    topics
  };
}
