import type { TopicRankingItem, TopicRankingSnapshot } from '@/lib/topic-ranking';
import { fetchBrazilXTrends, fetchRecentXPostCounts, type XTrendSnapshot } from '@/lib/x-api';
import {
  getLatestXTopicCount,
  getLatestXTrendSnapshot,
  persistXTopicCount,
  persistXTrendSnapshot,
  type StoredXTopicCount
} from '@/lib/x-trends-db';

const TREND_TTL_MS = 60 * 60 * 1000;
const COUNT_TTL_MS = 3 * 60 * 60 * 1000;

export type XTopicSignal = {
  status: 'enriched' | 'partial' | 'unavailable';
  observedAt: string | null;
  trendRank: number | null;
  matchedTrends: string[];
  trendPostCount: number | null;
  totalPosts24h: number | null;
  latestHourPosts: number | null;
  velocityPct: number | null;
  accelerationPct: number | null;
  xMomentumScore: number | null;
  volumeBasis: 'lang-pt-recent-counts' | null;
  geographyBasis: 'BR-WOEID-23424768';
};

export type XEnrichedTopic = Omit<TopicRankingItem, 'xSignal'> & {
  youtubeMomentumScore: number;
  youtubeOpportunityScore: number;
  xSignal: XTopicSignal;
};

export type XEnrichedTopicRanking = Omit<TopicRankingSnapshot, 'topics'> & {
  xObservedAt: string | null;
  xWarning: string | null;
  topics: XEnrichedTopic[];
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFresh(value: string | null | undefined, ttlMs: number): boolean {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() < ttlMs;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentileScore(value: number, values: number[]): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (values.length <= 1) return value > 0 ? 50 : 0;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((candidate) => candidate < value).length;
  const equal = sorted.filter((candidate) => candidate === value).length;
  return clampScore(((below + Math.max(0, equal - 1) / 2) / (sorted.length - 1)) * 100);
}

function queryForTopic(topic: TopicRankingItem): string {
  const specific = topic.tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !['política brasileira', 'cultura pop', 'economia', 'mercados', 'entretenimento', 'ciência'].includes(tag.toLowerCase()))
    .slice(0, 4);
  const terms = (specific.length ? specific : topic.tags.slice(0, 3)).map((tag) => {
    const escaped = tag.replace(/"/g, '');
    return escaped.includes(' ') ? `"${escaped}"` : escaped;
  });
  // Double parentheses are intentionally part of the cache key for the complete-hour calculation version.
  return `((${terms.join(' OR ')})) lang:pt`;
}

function matchTopicToTrends(topic: TopicRankingItem, trends: XTrendSnapshot): {
  rank: number | null;
  names: string[];
  postCount: number | null;
} {
  const needles = [topic.label, ...topic.tags]
    .map(normalize)
    .filter((value) => value.length >= 3);

  const matches = trends.trends.filter((trend) => {
    const candidate = normalize(trend.name);
    return needles.some((needle) => candidate === needle || candidate.includes(needle) || needle.includes(candidate));
  });

  if (!matches.length) return { rank: null, names: [], postCount: null };
  const ordered = [...matches].sort((a, b) => a.rank - b.rank);
  return {
    rank: ordered[0].rank,
    names: ordered.slice(0, 4).map((trend) => trend.name),
    postCount: ordered.reduce<number | null>((best, trend) => {
      if (trend.postCount == null) return best;
      return best == null ? trend.postCount : Math.max(best, trend.postCount);
    }, null)
  };
}

async function loadTrends(): Promise<{ snapshot: XTrendSnapshot | null; warning: string | null }> {
  const cached = await getLatestXTrendSnapshot('BR').catch(() => null);
  if (cached && isFresh(cached.observedAt, TREND_TTL_MS)) return { snapshot: cached, warning: null };

  try {
    const live = await fetchBrazilXTrends(50);
    await persistXTrendSnapshot(live).catch(() => undefined);
    return { snapshot: live, warning: null };
  } catch (error) {
    if (cached) {
      return {
        snapshot: cached,
        warning: `X Trends não atualizou; usando último snapshot salvo. ${error instanceof Error ? error.message : ''}`.trim()
      };
    }
    return {
      snapshot: null,
      warning: error instanceof Error ? error.message : 'X Trends indisponível.'
    };
  }
}

async function loadCount(topic: TopicRankingItem): Promise<StoredXTopicCount | null> {
  const expectedQuery = queryForTopic(topic);
  const cached = await getLatestXTopicCount(topic.key).catch(() => null);
  if (cached && cached.query === expectedQuery && isFresh(cached.observedHour, COUNT_TTL_MS)) return cached;

  const live = await fetchRecentXPostCounts(expectedQuery, 24);
  await persistXTopicCount(topic.key, live).catch(() => undefined);
  return {
    topicKey: topic.key,
    observedHour: live.observedAt,
    query: live.query,
    totalPosts24h: live.totalPosts24h,
    latestHourPosts: live.latestHourPosts,
    previousHourPosts: live.previousHourPosts,
    velocityPct: live.velocityPct,
    accelerationPct: live.accelerationPct
  };
}

function trendRankScore(rank: number | null): number {
  if (rank == null) return 0;
  return clampScore(100 - (rank - 1) * (75 / 49));
}

function velocityScore(velocityPct: number | null): number {
  if (velocityPct == null) return 0;
  return clampScore(50 + 50 * Math.tanh(velocityPct / 100));
}

export async function enrichTopicRankingWithX(base: TopicRankingSnapshot): Promise<XEnrichedTopicRanking> {
  if (!process.env.X_BEARER_TOKEN) {
    return {
      ...base,
      xObservedAt: null,
      xWarning: 'X_BEARER_TOKEN is not configured',
      topics: base.topics.map((topic) => ({
        ...topic,
        youtubeMomentumScore: topic.momentumScore,
        youtubeOpportunityScore: topic.opportunityScore,
        xSignal: {
          status: 'unavailable', observedAt: null, trendRank: null, matchedTrends: [], trendPostCount: null,
          totalPosts24h: null, latestHourPosts: null, velocityPct: null, accelerationPct: null,
          xMomentumScore: null, volumeBasis: null, geographyBasis: 'BR-WOEID-23424768'
        } satisfies XTopicSignal
      }))
    };
  }

  const { snapshot: trends, warning: trendWarning } = await loadTrends();
  const countResults = await Promise.all(base.topics.map(async (topic) => {
    try {
      return await loadCount(topic);
    } catch {
      return await getLatestXTopicCount(topic.key).catch(() => null);
    }
  }));

  const volumeLogs = countResults
    .filter((item): item is StoredXTopicCount => Boolean(item))
    .map((item) => Math.log10(item.totalPosts24h + 1));

  const topics: XEnrichedTopic[] = base.topics.map((topic, index): XEnrichedTopic => {
    const count = countResults[index];
    const trendMatch = trends ? matchTopicToTrends(topic, trends) : { rank: null, names: [], postCount: null };
    const rankScore = trendRankScore(trendMatch.rank);
    const volumeScore = count ? percentileScore(Math.log10(count.totalPosts24h + 1), volumeLogs) : 0;
    const growthScore = velocityScore(count?.velocityPct ?? null);
    const availableComponents = [
      trendMatch.rank != null ? { value: rankScore, weight: 0.45 } : null,
      count ? { value: volumeScore, weight: 0.30 } : null,
      count ? { value: growthScore, weight: 0.25 } : null
    ].filter((item): item is { value: number; weight: number } => Boolean(item));
    const totalWeight = availableComponents.reduce((sum, item) => sum + item.weight, 0);
    const xMomentumScore = totalWeight > 0
      ? clampScore(availableComponents.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight)
      : null;

    const combinedMomentum = xMomentumScore == null
      ? topic.momentumScore
      : clampScore(topic.momentumScore * 0.72 + xMomentumScore * 0.28);
    const combinedOpportunity = xMomentumScore == null
      ? topic.opportunityScore
      : clampScore(topic.opportunityScore * 0.80 + xMomentumScore * 0.20);
    const xSignal: XTopicSignal = {
      status: trends || count ? (trends && count ? 'enriched' : 'partial') : 'unavailable',
      observedAt: count?.observedHour ?? trends?.observedAt ?? null,
      trendRank: trendMatch.rank,
      matchedTrends: trendMatch.names,
      trendPostCount: trendMatch.postCount,
      totalPosts24h: count?.totalPosts24h ?? null,
      latestHourPosts: count?.latestHourPosts ?? null,
      velocityPct: count?.velocityPct ?? null,
      accelerationPct: count?.accelerationPct ?? null,
      xMomentumScore,
      volumeBasis: count ? 'lang-pt-recent-counts' : null,
      geographyBasis: 'BR-WOEID-23424768'
    };

    return {
      ...topic,
      momentumScore: combinedMomentum,
      opportunityScore: combinedOpportunity,
      youtubeMomentumScore: topic.momentumScore,
      youtubeOpportunityScore: topic.opportunityScore,
      xSignal
    };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore || b.momentumScore - a.momentumScore)
    .map((topic, index) => ({ ...topic, rank: index + 1 }));

  return {
    ...base,
    xObservedAt: trends?.observedAt ?? null,
    xWarning: trendWarning,
    topics
  };
}
