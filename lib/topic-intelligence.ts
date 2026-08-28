import type { PopularVideo } from '@/lib/youtube-popularity';

export type TopicStage = 'DOMINANTE' | 'ACELERAÇÃO' | 'EM ALTA' | 'OBSERVAÇÃO';

export type TopicPulse = {
  key: string;
  label: string;
  stage: TopicStage;
  videoCount: number;
  channelCount: number;
  totalViews: number;
  totalViewsPerHour: number;
  averageHype: number;
  newestVideoAgeHours: number;
  shareOfRadarViews: number;
  dominanceScore: number;
  momentumScore: number;
  accelerationBasis: 'current-momentum-proxy';
  representativeVideos: PopularVideo[];
};

export type VideoTopic = {
  key: string;
  label: string;
  source: 'rule' | 'fallback';
};

export type TopicRepresentative = {
  topicKey: string;
  topicLabel: string;
  video: PopularVideo;
  topicVideoCount: number;
  collapsedCount: number;
};

export type RankingHomogeneity = {
  index: number;
  rawPairSimilarity: number;
  dominantTopicVideoShare: number;
  dominantTopicLabel: string | null;
  videoCount: number;
  pairCount: number;
  interpretation: 'DIVERSA' | 'MODERADA' | 'ALTA' | 'MUITO ALTA';
  curve: 'sigmoid-saturation-v1';
};

type TopicRule = {
  key: string;
  label: string;
  markers: string[];
};

const TOPIC_RULES: TopicRule[] = [
  {
    key: 'gta-vi',
    label: 'GTA VI',
    markers: ['gta 6', 'gta vi', 'grand theft auto 6', 'grand theft auto vi']
  },
  {
    key: 'free-fire',
    label: 'Free Fire',
    markers: ['free fire', 'garena free fire']
  },
  {
    key: 'marvel-mcu',
    label: 'Marvel / MCU',
    markers: [
      'vingadores',
      'avengers',
      'visionquest',
      'vision quest',
      'ultron',
      'x-men',
      'x men',
      'doutor destino',
      'doctor doom',
      'marvel'
    ]
  },
  {
    key: 'dc-universe',
    label: 'DC / Lanternas',
    markers: ['lanternas', 'lanterns', 'atrocitus', 'setor 666', 'dc comics', 'universo dc']
  },
  {
    key: 'efootball',
    label: 'eFootball',
    markers: ['efootball', 'e-football']
  },
  {
    key: 'futebol',
    label: 'Futebol',
    markers: ['brasileirao', 'brasileirão', 'libertadores', 'champions league', 'copa do brasil']
  },
  {
    key: 'inteligencia-artificial',
    label: 'Inteligência Artificial',
    markers: ['openai', 'chatgpt', 'gpt-5', 'gpt 5', 'gemini', 'claude', 'inteligencia artificial', 'inteligência artificial']
  }
];

const FALLBACK_STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'uns', 'umas', 'para', 'por', 'com', 'sem', 'que', 'como', 'mais', 'novo', 'nova',
  'novos', 'novas', 'urgente', 'agora', 'hoje', 'ontem', 'amanha', 'amanhã', 'analise', 'análise',
  'analisando', 'trailer', 'gameplay', 'gameplays', 'vazou', 'revelado', 'revelados', 'completo',
  'completa', 'tudo', 'vez', 'foi', 'tem', 'isso', 'esse', 'essa', 'meu', 'minha', 'joguei',
  'react', 'reagindo', 'reacao', 'reação', 'segredos', 'detalhes', 'primeiras', 'impressoes', 'impressões'
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

function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function meaningfulTokens(title: string): Set<string> {
  return new Set(
    normalize(title)
      .split(' ')
      .filter((token) => token.length >= 3 && !FALLBACK_STOPWORDS.has(token))
  );
}

function fallbackTopic(video: PopularVideo): VideoTopic {
  const tokens = [...meaningfulTokens(video.title)];
  const selected = tokens.slice(0, 2);
  if (!selected.length) {
    return { key: `video-${video.id}`, label: 'Outros assuntos', source: 'fallback' };
  }

  return {
    key: selected.join('-'),
    label: titleCase(selected.join(' ')),
    source: 'fallback'
  };
}

export function classifyVideoTopic(video: PopularVideo): VideoTopic {
  const haystack = normalize(video.title);
  const rule = TOPIC_RULES.find((candidate) =>
    candidate.markers.some((marker) => haystack.includes(normalize(marker)))
  );

  return rule
    ? { key: rule.key, label: rule.label, source: 'rule' }
    : fallbackTopic(video);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

/**
 * Core-topic similarity intentionally dominates editorial-angle similarity.
 * A react, analysis and secrets video about the same subject should be nearly identical
 * for topic-homogeneity purposes even if their wording and format differ.
 */
function thematicPairSimilarity(a: PopularVideo, b: PopularVideo): number {
  const topicA = classifyVideoTopic(a);
  const topicB = classifyVideoTopic(b);
  const lexical = jaccardSimilarity(meaningfulTokens(a.title), meaningfulTokens(b.title));

  if (topicA.key === topicB.key) {
    const thematicBase = topicA.source === 'rule' && topicB.source === 'rule' ? 0.96 : 0.88;
    return Math.min(1, thematicBase + lexical * (1 - thematicBase));
  }

  // Different core topics can still share some vocabulary, but that overlap is deliberately capped.
  return Math.min(0.58, lexical * 0.72);
}

/**
 * Normalized logistic curve. The inflection point is deliberately below the midpoint,
 * so early repetition raises the score quickly while additional repetition above the
 * average produces diminishing marginal gains and saturates toward 100.
 */
function sigmoidSaturation(rawSimilarity: number): number {
  const x = Math.max(0, Math.min(1, rawSimilarity));
  const steepness = 7;
  const center = 0.22;
  const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
  const low = sigmoid(-steepness * center);
  const high = sigmoid(steepness * (1 - center));
  const transformed = (sigmoid(steepness * (x - center)) - low) / (high - low);
  return Math.max(0, Math.min(100, Math.round(transformed * 100)));
}

export function calculateRankingHomogeneity(videos: PopularVideo[]): RankingHomogeneity {
  const unique = [...new Map(videos.map((video) => [video.id, video])).values()];
  const videoCount = unique.length;

  if (videoCount < 2) {
    return {
      index: 0,
      rawPairSimilarity: 0,
      dominantTopicVideoShare: videoCount ? 1 : 0,
      dominantTopicLabel: videoCount ? classifyVideoTopic(unique[0]).label : null,
      videoCount,
      pairCount: 0,
      interpretation: 'DIVERSA',
      curve: 'sigmoid-saturation-v1'
    };
  }

  let similaritySum = 0;
  let pairCount = 0;
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      similaritySum += thematicPairSimilarity(unique[i], unique[j]);
      pairCount += 1;
    }
  }

  const rawPairSimilarity = pairCount ? similaritySum / pairCount : 0;
  const index = sigmoidSaturation(rawPairSimilarity);

  const topicCounts = new Map<string, { label: string; count: number }>();
  for (const video of unique) {
    const topic = classifyVideoTopic(video);
    const current = topicCounts.get(topic.key) ?? { label: topic.label, count: 0 };
    current.count += 1;
    topicCounts.set(topic.key, current);
  }
  const dominant = [...topicCounts.values()].sort((a, b) => b.count - a.count)[0];

  const interpretation: RankingHomogeneity['interpretation'] =
    index >= 85 ? 'MUITO ALTA' : index >= 65 ? 'ALTA' : index >= 40 ? 'MODERADA' : 'DIVERSA';

  return {
    index,
    rawPairSimilarity: Math.round(rawPairSimilarity * 1000) / 1000,
    dominantTopicVideoShare: dominant ? dominant.count / videoCount : 0,
    dominantTopicLabel: dominant?.label ?? null,
    videoCount,
    pairCount,
    interpretation,
    curve: 'sigmoid-saturation-v1'
  };
}

export function diversifyVideosByTopic(
  videos: PopularVideo[],
  mode: 'hype' | 'views'
): TopicRepresentative[] {
  const sorted = [...videos].sort((a, b) =>
    mode === 'hype' ? b.hypeScore - a.hypeScore : b.views - a.views
  );
  const counts = new Map<string, { label: string; count: number }>();

  for (const video of sorted) {
    const topic = classifyVideoTopic(video);
    const current = counts.get(topic.key) ?? { label: topic.label, count: 0 };
    current.count += 1;
    counts.set(topic.key, current);
  }

  const seen = new Set<string>();
  const representatives: TopicRepresentative[] = [];
  for (const video of sorted) {
    const topic = classifyVideoTopic(video);
    if (seen.has(topic.key)) continue;
    seen.add(topic.key);
    const count = counts.get(topic.key)?.count ?? 1;
    representatives.push({
      topicKey: topic.key,
      topicLabel: topic.label,
      video,
      topicVideoCount: count,
      collapsedCount: Math.max(0, count - 1)
    });
  }

  return representatives;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildTopicPulses(videos: PopularVideo[]): TopicPulse[] {
  const uniqueVideos = [...new Map(videos.map((video) => [video.id, video])).values()];
  if (!uniqueVideos.length) return [];

  const totalRadarViews = uniqueVideos.reduce((sum, video) => sum + video.views, 0) || 1;
  const groups = new Map<string, { label: string; videos: PopularVideo[] }>();

  for (const video of uniqueVideos) {
    const topic = classifyVideoTopic(video);
    const group = groups.get(topic.key) ?? { label: topic.label, videos: [] };
    group.videos.push(video);
    groups.set(topic.key, group);
  }

  const raw = [...groups.entries()].map(([key, group]) => {
    const sorted = [...group.videos].sort((a, b) => b.hypeScore - a.hypeScore || b.viewsPerHour - a.viewsPerHour);
    const totalViews = sorted.reduce((sum, video) => sum + video.views, 0);
    const totalViewsPerHour = sorted.reduce((sum, video) => sum + video.viewsPerHour, 0);
    const averageHype = sorted.reduce((sum, video) => sum + video.hypeScore, 0) / sorted.length;
    const newestVideoAgeHours = Math.min(...sorted.map((video) => video.ageHours));
    const channelCount = new Set(sorted.map((video) => video.channelId)).size;
    const shareOfRadarViews = totalViews / totalRadarViews;
    const multiSourceSignal = Math.min(1, channelCount / 3);
    const repetitionSignal = Math.min(1, sorted.length / 4);
    const recencySignal = 1 / Math.sqrt(Math.max(newestVideoAgeHours, 1) / 6);
    const velocitySignal = Math.log10(totalViewsPerHour + 1) / 5;

    const momentumRaw =
      velocitySignal * 42 +
      multiSourceSignal * 20 +
      repetitionSignal * 18 +
      Math.min(recencySignal, 1.4) * 10 +
      (averageHype / 100) * 10;

    const dominanceRaw =
      Math.log10(totalViews + 1) * 11 +
      Math.log10(totalViewsPerHour + 1) * 9 +
      shareOfRadarViews * 35 +
      Math.min(sorted.length, 4) * 4;

    return {
      key,
      label: group.label,
      videoCount: sorted.length,
      channelCount,
      totalViews,
      totalViewsPerHour,
      averageHype,
      newestVideoAgeHours,
      shareOfRadarViews,
      momentumRaw,
      dominanceRaw,
      representativeVideos: sorted.slice(0, 3)
    };
  });

  const maxMomentum = Math.max(...raw.map((topic) => topic.momentumRaw), 1);
  const maxDominance = Math.max(...raw.map((topic) => topic.dominanceRaw), 1);

  const pulses = raw.map((topic) => {
    const momentumScore = clampScore(45 + (topic.momentumRaw / maxMomentum) * 55);
    const dominanceScore = clampScore(45 + (topic.dominanceRaw / maxDominance) * 55);

    let stage: TopicStage = 'OBSERVAÇÃO';
    if (dominanceScore >= 92 && topic.videoCount >= 2) stage = 'DOMINANTE';
    else if (momentumScore >= 82 && topic.channelCount >= 2) stage = 'ACELERAÇÃO';
    else if (momentumScore >= 68 || dominanceScore >= 72) stage = 'EM ALTA';

    return {
      key: topic.key,
      label: topic.label,
      stage,
      videoCount: topic.videoCount,
      channelCount: topic.channelCount,
      totalViews: topic.totalViews,
      totalViewsPerHour: topic.totalViewsPerHour,
      averageHype: Math.round(topic.averageHype),
      newestVideoAgeHours: topic.newestVideoAgeHours,
      shareOfRadarViews: topic.shareOfRadarViews,
      dominanceScore,
      momentumScore,
      accelerationBasis: 'current-momentum-proxy' as const,
      representativeVideos: topic.representativeVideos
    };
  });

  return pulses.sort((a, b) => b.dominanceScore - a.dominanceScore || b.momentumScore - a.momentumScore);
}
