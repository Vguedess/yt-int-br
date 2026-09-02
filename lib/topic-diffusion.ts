import type { PopularVideo } from '@/lib/youtube-popularity';
import { classifyVideoTopic } from '@/lib/topic-intelligence';
import type { NodeTier } from '@/lib/network-diffusion';

export const TOPIC_DIFFUSION_MODEL_VERSION = 'topic-diffusion-v1' as const;

export type DiffusionStage =
  | 'INSUFFICIENT_DATA'
  | 'EMERGING'
  | 'PERIPHERAL_SIGNAL'
  | 'EARLY_EXPANSION'
  | 'CROSSOVER'
  | 'MASS';

export type TopicDiffusionSignal = {
  modelVersion: typeof TOPIC_DIFFUSION_MODEL_VERSION;
  basis: 'current-cross-section-proxy';
  topicKey: string;
  topicLabel: string;
  stage: DiffusionStage;
  opportunityScore: number;
  videoCount: number;
  channelCount: number;
  attentionShare: number;
  peripheralBreakout: number;
  mediumBreakout: number;
  largePenetration: number;
  hubPenetration: number;
  tierVideoCounts: Record<NodeTier, number>;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

const TIERS: NodeTier[] = ['PERIPHERAL', 'MEDIUM', 'LARGE', 'HUB', 'UNKNOWN'];

function emptyTierCounts(): Record<NodeTier, number> {
  return {
    PERIPHERAL: 0,
    MEDIUM: 0,
    LARGE: 0,
    HUB: 0,
    UNKNOWN: 0
  };
}

/**
 * Cross-sectional diffusion proxy. It deliberately distinguishes peripheral breakout from
 * hub penetration, so a topic can rank highly before the largest nodes have saturated it.
 * Once temporal snapshots exist, stage transitions should be upgraded from this proxy to
 * observed movement between tiers over time.
 */
export function buildTopicDiffusionSignals(videos: PopularVideo[]): TopicDiffusionSignal[] {
  const unique = [...new Map(videos.map((video) => [video.id, video])).values()];
  if (!unique.length) return [];

  const totalViews = unique.reduce((sum, video) => sum + video.views, 0) || 1;
  const cohortTierTotals = emptyTierCounts();
  for (const video of unique) cohortTierTotals[video.nodeTier] += 1;

  const groups = new Map<string, { label: string; videos: PopularVideo[] }>();
  for (const video of unique) {
    const topic = classifyVideoTopic(video);
    const group = groups.get(topic.key) ?? { label: topic.label, videos: [] };
    group.videos.push(video);
    groups.set(topic.key, group);
  }

  const signals = [...groups.entries()].map(([topicKey, group]) => {
    const tierVideoCounts = emptyTierCounts();
    for (const video of group.videos) tierVideoCounts[video.nodeTier] += 1;

    const peripheralBreakout = clampScore(average(
      group.videos.filter((video) => video.nodeTier === 'PERIPHERAL').map((video) => video.breakoutStrength)
    ));
    const mediumBreakout = clampScore(average(
      group.videos.filter((video) => video.nodeTier === 'MEDIUM').map((video) => video.breakoutStrength)
    ));
    const largePenetration = cohortTierTotals.LARGE
      ? clampScore((tierVideoCounts.LARGE / cohortTierTotals.LARGE) * 100)
      : 0;
    const hubPenetration = cohortTierTotals.HUB
      ? clampScore((tierVideoCounts.HUB / cohortTierTotals.HUB) * 100)
      : 0;
    const attentionShare = group.videos.reduce((sum, video) => sum + video.views, 0) / totalViews;
    const channelCount = new Set(group.videos.map((video) => video.channelId)).size;
    const sourceBreadth = clampScore((channelCount / 4) * 100);
    const headroom = clampScore(100 - hubPenetration * 0.75 - attentionShare * 25);

    let stage: DiffusionStage = 'EMERGING';
    if (group.videos.length < 2 || channelCount < 2) stage = 'INSUFFICIENT_DATA';
    else if (hubPenetration >= 55 || attentionShare >= 0.42) stage = 'MASS';
    else if (largePenetration >= 30 && hubPenetration < 55) stage = 'CROSSOVER';
    else if (peripheralBreakout >= 65 && mediumBreakout >= 55 && hubPenetration < 45) stage = 'EARLY_EXPANSION';
    else if (peripheralBreakout >= 72 && hubPenetration < 25) stage = 'PERIPHERAL_SIGNAL';

    const opportunityScore = stage === 'INSUFFICIENT_DATA'
      ? clampScore(
          group.videos[0]?.breakoutStrength * 0.55 +
          group.videos[0]?.viralForce * 0.25 +
          headroom * 0.20
        )
      : clampScore(
          peripheralBreakout * 0.30 +
          mediumBreakout * 0.20 +
          sourceBreadth * 0.15 +
          headroom * 0.20 +
          average(group.videos.map((video) => video.viralForce)) * 0.15
        );

    return {
      modelVersion: TOPIC_DIFFUSION_MODEL_VERSION,
      basis: 'current-cross-section-proxy' as const,
      topicKey,
      topicLabel: group.label,
      stage,
      opportunityScore,
      videoCount: group.videos.length,
      channelCount,
      attentionShare,
      peripheralBreakout,
      mediumBreakout,
      largePenetration,
      hubPenetration,
      tierVideoCounts
    };
  });

  return signals.sort(
    (a, b) => b.opportunityScore - a.opportunityScore || b.peripheralBreakout - a.peripheralBreakout
  );
}
