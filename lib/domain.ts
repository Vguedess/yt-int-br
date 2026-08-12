export type TrendRegime = 'PRE_TREND' | 'ACCELERATION' | 'PEAK' | 'DECLINE' | 'EVERGREEN';

export type DecisionConstraints = {
  objective: string;
  allowedTopics: string[];
  forbiddenTopics: string[];
  maxProductionHours: number;
  riskTolerance: 'low' | 'medium' | 'high';
};

export type CandidateSignal = {
  id: string;
  topic: string;
  angle: string;
  category: string;
  regime: TrendRegime;
  demand: number;
  demandVelocity: number;
  demandAcceleration: number;
  supply: number;
  supplyVelocity: number;
  concentration: number;
  audienceFit: number;
  novelty: number;
  sourceStrength: number;
  informationLeadHours: number;
  longevity: number;
  risk: number;
};

export type VideoDecision = CandidateSignal & {
  rank: number;
  score: number;
  confidence: number;
  publishWindow: string;
  explanation: string[];
  risks: string[];
};
