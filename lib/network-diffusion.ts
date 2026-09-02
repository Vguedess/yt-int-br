export const NETWORK_BREAKOUT_MODEL_VERSION = 'network-breakout-v1' as const;

export type NodeTier = 'PERIPHERAL' | 'MEDIUM' | 'LARGE' | 'HUB' | 'UNKNOWN';
export type ExpectedReachBasis =
  | 'historical-channel-baseline'
  | 'cohort-log-regression'
  | 'cohort-robust-fallback';

export type HistoricalChannelBaseline = {
  expectedViews: number;
  expectedEngagementRate?: number | null;
};

export type BreakoutCandidate = {
  id: string;
  views: number;
  subscribers: number | null;
  ageHours: number;
  viewsPerHour: number;
  engagementRate: number;
  historicalBaseline?: HistoricalChannelBaseline | null;
};

export type NetworkBreakoutMetrics = {
  modelVersion: typeof NETWORK_BREAKOUT_MODEL_VERSION;
  nodeTier: NodeTier;
  expectedReach: number;
  expectedReachBasis: ExpectedReachBasis;
  networkEscape: number;
  nodeDifficulty: number;
  attentionPercentile: number;
  velocityPercentile: number;
  engagementResidual: number;
  breakoutStrength: number;
  viralForce: number;
  hypeScore: number;
};

type ReachModel = {
  intercept: number;
  subscriberExponent: number;
  ageExponent: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentileRanks(values: number[]): number[] {
  if (!values.length) return [];
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length).fill(50);

  let cursor = 0;
  while (cursor < ordered.length) {
    let end = cursor;
    while (end + 1 < ordered.length && ordered[end + 1].value === ordered[cursor].value) end += 1;
    const averageRank = (cursor + end) / 2;
    const percentile = ordered.length === 1 ? 50 : (averageRank / (ordered.length - 1)) * 100;
    for (let i = cursor; i <= end; i += 1) result[ordered[i].index] = percentile;
    cursor = end + 1;
  }

  return result;
}

function solve3x3(matrix: number[][], vector: number[]): number[] | null {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];

    const divisor = augmented[column][column];
    for (let j = column; j < 4; j += 1) augmented[column][j] /= divisor;

    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j < 4; j += 1) augmented[row][j] -= factor * augmented[column][j];
    }
  }

  const solution = augmented.map((row) => row[3]);
  return solution.every(Number.isFinite) ? solution : null;
}

/**
 * Cross-sectional fallback until enough same-channel history exists.
 * The model estimates expected views from node size and video age inside the current cohort,
 * instead of assuming that one million views means the same thing for every channel.
 */
function fitReachModel(candidates: BreakoutCandidate[]): ReachModel | null {
  const samples = candidates.filter(
    (candidate) =>
      !candidate.historicalBaseline &&
      candidate.subscribers !== null &&
      candidate.subscribers > 0 &&
      candidate.views > 0 &&
      candidate.ageHours > 0
  );
  if (samples.length < 6) return null;

  const xs = samples.map((candidate) => [
    1,
    Math.log(candidate.subscribers! + 1),
    Math.log(candidate.ageHours + 1)
  ]);
  const ys = samples.map((candidate) => Math.log(candidate.views + 1));
  const xtx = Array.from({ length: 3 }, () => Array<number>(3).fill(0));
  const xty = Array<number>(3).fill(0);

  for (let i = 0; i < xs.length; i += 1) {
    for (let row = 0; row < 3; row += 1) {
      xty[row] += xs[i][row] * ys[i];
      for (let column = 0; column < 3; column += 1) xtx[row][column] += xs[i][row] * xs[i][column];
    }
  }

  // Small ridge term keeps the cohort regression stable when channel sizes are clustered.
  xtx[1][1] += 0.01;
  xtx[2][2] += 0.01;
  const solution = solve3x3(xtx, xty);
  if (!solution) return null;

  return {
    intercept: solution[0],
    subscriberExponent: clamp(solution[1], 0.15, 1.35),
    ageExponent: clamp(solution[2], 0.15, 1.5)
  };
}

function nodeTier(subscribers: number | null): NodeTier {
  if (subscribers === null || subscribers <= 0) return 'UNKNOWN';
  if (subscribers <= 1_000_000) return 'PERIPHERAL';
  if (subscribers <= 5_000_000) return 'MEDIUM';
  if (subscribers <= 15_000_000) return 'LARGE';
  return 'HUB';
}

function expectedReachFromModel(candidate: BreakoutCandidate, model: ReachModel): number | null {
  if (candidate.subscribers === null || candidate.subscribers <= 0) return null;
  const logExpected =
    model.intercept +
    model.subscriberExponent * Math.log(candidate.subscribers + 1) +
    model.ageExponent * Math.log(candidate.ageHours + 1);
  const expected = Math.exp(clamp(logExpected, 0, 30)) - 1;
  return Number.isFinite(expected) && expected > 0 ? expected : null;
}

function robustFallbackExpectedReach(candidate: BreakoutCandidate, cohort: BreakoutCandidate[]): number {
  const medianViews = Math.max(1, median(cohort.map((item) => item.views)));
  const medianAge = Math.max(1, median(cohort.map((item) => item.ageHours)));
  const knownSubscribers = cohort
    .map((item) => item.subscribers)
    .filter((value): value is number => value !== null && value > 0);
  const medianSubscribers = Math.max(1, median(knownSubscribers));

  const subscriberAdjustment = candidate.subscribers && candidate.subscribers > 0
    ? Math.pow(candidate.subscribers / medianSubscribers, 0.65)
    : 1;
  const ageAdjustment = Math.pow((candidate.ageHours + 1) / (medianAge + 1), 0.75);
  return Math.max(1, medianViews * subscriberAdjustment * ageAdjustment);
}

function escapeScore(networkEscape: number): number {
  // 1x baseline = 50, 10x = 75, 100x = 100, 0.1x = 25.
  return clampScore(50 + 25 * Math.log10(Math.max(networkEscape, 0.01)));
}

function residualScore(residual: number): number {
  return clampScore(50 + 20 * Math.log10(Math.max(residual, 0.05)));
}

/**
 * Scores a cohort jointly because node difficulty is relational: a low-reach node must
 * escape a materially smaller expected distribution basin than a hub. Historical channel
 * baselines take precedence; otherwise the current cohort supplies a log-size/age prior.
 */
export function scoreNetworkBreakoutCohort(candidates: BreakoutCandidate[]): Map<string, NetworkBreakoutMetrics> {
  if (!candidates.length) return new Map();

  const model = fitReachModel(candidates);
  const expected = candidates.map((candidate) => {
    if (candidate.historicalBaseline?.expectedViews && candidate.historicalBaseline.expectedViews > 0) {
      return {
        value: candidate.historicalBaseline.expectedViews,
        basis: 'historical-channel-baseline' as const
      };
    }

    const regression = model ? expectedReachFromModel(candidate, model) : null;
    if (regression) return { value: regression, basis: 'cohort-log-regression' as const };

    return {
      value: robustFallbackExpectedReach(candidate, candidates),
      basis: 'cohort-robust-fallback' as const
    };
  });

  const attentionPercentiles = percentileRanks(candidates.map((candidate) => candidate.views));
  const velocityPercentiles = percentileRanks(candidates.map((candidate) => candidate.viewsPerHour));
  const expectedPercentiles = percentileRanks(expected.map((item) => item.value));
  const cohortEngagementMedian = Math.max(0.0001, median(candidates.map((candidate) => candidate.engagementRate)));
  const results = new Map<string, NetworkBreakoutMetrics>();

  candidates.forEach((candidate, index) => {
    const expectedReach = Math.max(1, expected[index].value);
    const networkEscape = candidate.views / expectedReach;
    const difficulty = 100 - expectedPercentiles[index];
    const expectedEngagement = candidate.historicalBaseline?.expectedEngagementRate && candidate.historicalBaseline.expectedEngagementRate > 0
      ? candidate.historicalBaseline.expectedEngagementRate
      : cohortEngagementMedian;
    const engagementResidual = candidate.engagementRate / expectedEngagement;
    const breakout = clampScore(
      escapeScore(networkEscape) * 0.55 +
      residualScore(engagementResidual) * 0.20 +
      difficulty * 0.25
    );
    const viralForce = clampScore(
      breakout * 0.45 +
      velocityPercentiles[index] * 0.30 +
      attentionPercentiles[index] * 0.25
    );
    const recencyScore = clampScore(100 / Math.sqrt(Math.max(candidate.ageHours, 1) / 6));
    const hypeScore = clampScore(
      viralForce * 0.60 +
      recencyScore * 0.25 +
      residualScore(engagementResidual) * 0.15
    );

    results.set(candidate.id, {
      modelVersion: NETWORK_BREAKOUT_MODEL_VERSION,
      nodeTier: nodeTier(candidate.subscribers),
      expectedReach: Math.round(expectedReach),
      expectedReachBasis: expected[index].basis,
      networkEscape: Math.round(networkEscape * 100) / 100,
      nodeDifficulty: clampScore(difficulty),
      attentionPercentile: clampScore(attentionPercentiles[index]),
      velocityPercentile: clampScore(velocityPercentiles[index]),
      engagementResidual: Math.round(engagementResidual * 100) / 100,
      breakoutStrength: breakout,
      viralForce,
      hypeScore
    });
  });

  return results;
}
