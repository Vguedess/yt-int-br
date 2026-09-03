import type { CategoryLeader } from '@/lib/youtube-category-leaders';
import type { HypeVideoCard } from '@/lib/youtube-hype-service';

export const TOPIC_RANKING_MODEL_VERSION = 'topic-ranking-saturation-v1' as const;
export const TOPIC_SATURATION_CURVE = 'sigmoid-saturation-v1' as const;

export type TopicRankingStage = 'BREAKOUT' | 'ACELERACAO' | 'EM_ALTA' | 'SATURANDO' | 'OBSERVACAO';
export type TopicSourceKind = 'leader-24h' | 'youtube-hype';

export type TopicEvidenceVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  source: TopicSourceKind;
  sourceRank: number | null;
  views: number;
  subscribers: number | null;
};

export type TopicRankingItem = {
  rank: number;
  key: string;
  label: string;
  tags: string[];
  stage: TopicRankingStage;
  opportunityScore: number;
  saturationScore: number;
  attentionScore: number;
  momentumScore: number;
  breakoutScore: number;
  videoCount: number;
  channelCount: number;
  totalViews: number;
  sourceCoverage: Array<'LEADER_24H' | 'YOUTUBE_HYPE'>;
  semanticOverlap: number;
  saturationBasis: 'exact-repetition-plus-tag-overlap';
  xSignal: {
    status: 'awaiting-enrichment';
    volume: null;
    velocity: null;
    engagement: null;
  };
  evidence: TopicEvidenceVideo[];
};

export type TopicRankingSnapshot = {
  generatedAt: string;
  market: 'BR';
  modelVersion: typeof TOPIC_RANKING_MODEL_VERSION;
  saturationCurve: typeof TOPIC_SATURATION_CURVE;
  basis: 'current-8-video-universe';
  universeVideoCount: number;
  leaderVideoCount: number;
  hypeVideoCount: number;
  topics: TopicRankingItem[];
};

type ThemeDefinition = {
  key: string;
  label: string;
  tags: string[];
};

type TopicVideo = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  views: number;
  subscribers: number | null;
  publishedAt: string | null;
  source: TopicSourceKind;
  sourceRank: number | null;
  theme: ThemeDefinition;
};

const MANUAL_VIDEO_THEMES: Record<string, ThemeDefinition> = {
  qjXEOUHV01Q: {
    key: 'renan-santos-partido-missao',
    label: 'Renan Santos / Partido Missão',
    tags: ['renan santos', 'partido missão', 'militância política', 'estratégia eleitoral', 'eleições 2026', 'política brasileira']
  },
  'Lj6-YFDQ_kk': {
    key: 'gta-vi',
    label: 'GTA VI',
    tags: ['gta vi', 'gta 6', 'rockstar games', 'games', 'cultura pop']
  },
  tLRUFH0UGEo: {
    key: 'lula-jornal-nacional',
    label: 'Lula / Jornal Nacional',
    tags: ['lula', 'jornal nacional', 'eleições 2026', 'análise política', 'política brasileira']
  },
  S5Xh6HEoMMs: {
    key: 'industria-de-alimentos',
    label: 'Indústria de alimentos',
    tags: ['indústria de alimentos', 'alimentação', 'consumo', 'saúde pública', 'documentário']
  }
};

const RULES: Array<{ markers: string[]; theme: ThemeDefinition }> = [
  {
    markers: ['alexandre de moraes', 'moraes', 'stf'],
    theme: {
      key: 'stf-alexandre-de-moraes',
      label: 'STF / Alexandre de Moraes',
      tags: ['stf', 'alexandre de moraes', 'polícia federal', 'judiciário', 'política brasileira']
    }
  },
  {
    markers: ['bepicolombo', 'mercury', 'mercúrio'],
    theme: {
      key: 'bepicolombo-mercurio',
      label: 'BepiColombo / Mercúrio',
      tags: ['bepicolombo', 'mercúrio', 'esa', 'exploração espacial', 'ciência']
    }
  },
  {
    markers: ['banco central', 'copom', 'selic'],
    theme: {
      key: 'banco-central-regulacao',
      label: 'Banco Central / regulação financeira',
      tags: ['banco central', 'regulação financeira', 'sistema financeiro', 'economia', 'mercados']
    }
  },
  {
    markers: ['estreias de setembro', 'estreias', 'cinema'],
    theme: {
      key: 'estreias-de-cinema',
      label: 'Estreias de cinema',
      tags: ['cinema', 'estreias', 'filmes', 'entretenimento', 'cultura pop']
    }
  },
  {
    markers: ['gta 6', 'gta vi'],
    theme: MANUAL_VIDEO_THEMES['Lj6-YFDQ_kk']
  },
  {
    markers: ['lula', 'jornal nacional'],
    theme: MANUAL_VIDEO_THEMES.tLRUFH0UGEo
  }
];

const FALLBACK_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'para', 'por', 'com', 'que', 'como', 'mais', 'agora', 'hoje', 'novo', 'nova',
  'tudo', 'sobre', 'primeiro', 'primeira', 'segundo', 'segunda'
]);

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value: string): string {
  return normalize(value).replace(/\s+/g, '-');
}

function titleCase(value: string): string {
  return value.split(' ').filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join(' ');
}

function fallbackTheme(title: string): ThemeDefinition {
  const tokens = normalize(title).split(' ').filter((token) => token.length >= 3 && !FALLBACK_STOPWORDS.has(token));
  const selected = tokens.slice(0, 3);
  const label = selected.length ? titleCase(selected.join(' ')) : 'Outros assuntos';
  return {
    key: selected.length ? slug(selected.join(' ')) : 'outros-assuntos',
    label,
    tags: selected.length ? selected : ['outros assuntos']
  };
}

function classifyTheme(videoId: string, title: string): ThemeDefinition {
  const manual = MANUAL_VIDEO_THEMES[videoId];
  if (manual) return manual;
  const haystack = normalize(title);
  const rule = RULES.find((candidate) => candidate.markers.some((marker) => haystack.includes(normalize(marker))));
  return rule?.theme ?? fallbackTheme(title);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sigmoidSaturation(rawSimilarity: number): number {
  const x = Math.max(0, Math.min(1, rawSimilarity));
  const steepness = 7;
  const center = 0.22;
  const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
  const low = sigmoid(-steepness * center);
  const high = sigmoid(steepness * (1 - center));
  const transformed = (sigmoid(steepness * (x - center)) - low) / (high - low);
  return clampScore(transformed * 100);
}

function jaccard(a: string[], b: string[]): number {
  const left = new Set(a.map(normalize));
  const right = new Set(b.map(normalize));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function ageHours(publishedAt: string | null): number {
  if (!publishedAt) return 168;
  return Math.max(0.25, (Date.now() - new Date(publishedAt).getTime()) / 3_600_000);
}

function sourceSignal(video: TopicVideo): number {
  if (video.source === 'youtube-hype') {
    const rank = video.sourceRank ?? 4;
    return clampScore(100 - (rank - 1) * 14);
  }
  return 64;
}

function breakoutProxy(video: TopicVideo): number {
  if (!video.subscribers || video.subscribers <= 0 || video.views <= 0) return 45;
  const ratio = video.views / video.subscribers;
  return clampScore(42 + Math.log10(Math.max(ratio, 0.05)) * 24);
}

function velocityProxy(video: TopicVideo): number {
  const velocity = video.views / ageHours(video.publishedAt);
  return Math.log10(Math.max(velocity, 1));
}

function percentileScore(value: number, values: number[]): number {
  if (values.length <= 1) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((candidate) => candidate < value).length;
  const equal = sorted.filter((candidate) => candidate === value).length;
  return clampScore(((below + Math.max(0, equal - 1) / 2) / (sorted.length - 1)) * 100);
}

function toTopicVideos(leaders: CategoryLeader[], hype: HypeVideoCard[]): TopicVideo[] {
  const leaderVideos: TopicVideo[] = leaders.map((video) => ({
    videoId: video.videoId,
    title: video.title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    views: video.views,
    subscribers: video.subscribers,
    publishedAt: video.publishedAt,
    source: 'leader-24h',
    sourceRank: null,
    theme: classifyTheme(video.videoId, video.title)
  }));

  const hypeVideos: TopicVideo[] = hype.map((video) => ({
    videoId: video.videoId,
    title: video.title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    views: video.currentViews,
    subscribers: video.subscribers,
    publishedAt: video.publishedAt,
    source: 'youtube-hype',
    sourceRank: video.rank,
    theme: classifyTheme(video.videoId, video.title)
  }));

  return [...new Map([...leaderVideos, ...hypeVideos].map((video) => [video.videoId, video])).values()];
}

export function buildTopicRanking(leaders: CategoryLeader[], hype: HypeVideoCard[]): TopicRankingSnapshot {
  const universe = toTopicVideos(leaders.slice(0, 4), hype.slice(0, 4));
  const groups = new Map<string, { theme: ThemeDefinition; videos: TopicVideo[] }>();

  for (const video of universe) {
    const group = groups.get(video.theme.key) ?? { theme: video.theme, videos: [] };
    group.videos.push(video);
    groups.set(video.theme.key, group);
  }

  const groupList = [...groups.values()];
  const logViews = universe.map((video) => Math.log10(video.views + 1));
  const velocities = universe.map(velocityProxy);

  const scored = groupList.map((group) => {
    const views = group.videos.reduce((sum, video) => sum + video.views, 0);
    const channels = new Set(group.videos.map((video) => video.channelId || video.channelTitle));
    const exactRepetition = Math.min(1, Math.max(0, group.videos.length - 1) / 3);
    const otherThemes = groupList.filter((candidate) => candidate.theme.key !== group.theme.key);
    const overlaps = otherThemes.map((candidate) => jaccard(group.theme.tags, candidate.theme.tags));
    const maxSemanticOverlap = overlaps.length ? Math.max(...overlaps) : 0;
    const meanSemanticOverlap = overlaps.length ? overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length : 0;
    const sources = new Set(group.videos.map((video) => video.source));
    const crossSource = sources.size > 1 ? 1 : 0;

    // Preserve the original sigmoid behavior: the strongest semantic collision should reach
    // the curve directly. Repetition/cross-source evidence only adds pressure on top of it.
    const rawSaturation = Math.min(
      1,
      Math.max(exactRepetition, maxSemanticOverlap) + meanSemanticOverlap * 0.10 + crossSource * 0.10
    );
    const saturationScore = sigmoidSaturation(rawSaturation);

    const perVideoAttention = group.videos.map((video) => percentileScore(Math.log10(video.views + 1), logViews));
    const perVideoVelocity = group.videos.map((video) => percentileScore(velocityProxy(video), velocities));
    const attentionScore = clampScore(perVideoAttention.reduce((sum, value) => sum + value, 0) / perVideoAttention.length);
    const breakoutScore = clampScore(group.videos.reduce((sum, video) => sum + breakoutProxy(video), 0) / group.videos.length);
    const sourceStrength = clampScore(group.videos.reduce((sum, video) => sum + sourceSignal(video), 0) / group.videos.length);
    const velocityStrength = clampScore(perVideoVelocity.reduce((sum, value) => sum + value, 0) / perVideoVelocity.length);
    const momentumScore = clampScore(velocityStrength * 0.55 + sourceStrength * 0.45);
    const opportunityScore = clampScore(
      momentumScore * 0.31 +
      breakoutScore * 0.27 +
      attentionScore * 0.22 +
      (100 - saturationScore) * 0.20
    );

    let stage: TopicRankingStage = 'OBSERVACAO';
    if (saturationScore >= 72) stage = 'SATURANDO';
    else if (sources.has('youtube-hype') && breakoutScore >= 72 && saturationScore < 60) stage = 'BREAKOUT';
    else if (momentumScore >= 74) stage = 'ACELERACAO';
    else if (attentionScore >= 68 || opportunityScore >= 68) stage = 'EM_ALTA';

    const sourceCoverage: TopicRankingItem['sourceCoverage'] = [];
    if (sources.has('leader-24h')) sourceCoverage.push('LEADER_24H');
    if (sources.has('youtube-hype')) sourceCoverage.push('YOUTUBE_HYPE');

    return {
      rank: 0,
      key: group.theme.key,
      label: group.theme.label,
      tags: group.theme.tags,
      stage,
      opportunityScore,
      saturationScore,
      attentionScore,
      momentumScore,
      breakoutScore,
      videoCount: group.videos.length,
      channelCount: channels.size,
      totalViews: views,
      sourceCoverage,
      semanticOverlap: Math.round(maxSemanticOverlap * 1000) / 1000,
      saturationBasis: 'exact-repetition-plus-tag-overlap' as const,
      xSignal: {
        status: 'awaiting-enrichment' as const,
        volume: null,
        velocity: null,
        engagement: null
      },
      evidence: group.videos.map((video) => ({
        videoId: video.videoId,
        title: video.title,
        channelTitle: video.channelTitle,
        source: video.source,
        sourceRank: video.sourceRank,
        views: video.views,
        subscribers: video.subscribers
      }))
    } satisfies TopicRankingItem;
  });

  const topics = scored
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.momentumScore - a.momentumScore || b.attentionScore - a.attentionScore)
    .map((topic, index) => ({ ...topic, rank: index + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    market: 'BR',
    modelVersion: TOPIC_RANKING_MODEL_VERSION,
    saturationCurve: TOPIC_SATURATION_CURVE,
    basis: 'current-8-video-universe',
    universeVideoCount: universe.length,
    leaderVideoCount: Math.min(4, leaders.length),
    hypeVideoCount: Math.min(4, hype.length),
    topics
  };
}
