import type { CandidateSignal, DecisionConstraints, VideoDecision } from './domain';

const regimeBonus: Record<CandidateSignal['regime'], number> = {
  PRE_TREND: 12,
  ACCELERATION: 8,
  PEAK: -4,
  DECLINE: -18,
  EVERGREEN: 5
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(values: string[]) {
  return values.map(v => v.trim().toLowerCase()).filter(Boolean);
}

export function rankDecisions(signals: CandidateSignal[], constraints: DecisionConstraints): VideoDecision[] {
  const allowed = normalizeText(constraints.allowedTopics);
  const forbidden = normalizeText(constraints.forbiddenTopics);

  return signals
    .filter(signal => allowed.length === 0 || allowed.some(topic => signal.category.toLowerCase().includes(topic) || signal.topic.toLowerCase().includes(topic)))
    .filter(signal => !forbidden.some(topic => signal.category.toLowerCase().includes(topic) || signal.topic.toLowerCase().includes(topic)))
    .map(signal => {
      const demandSupplyGap = clamp(signal.demand - signal.supply + 50);
      const momentum = clamp(50 + signal.demandVelocity * 1.5 + signal.demandAcceleration * 1.4 - signal.supplyVelocity);
      const temporalAdvantage = clamp(50 + signal.informationLeadHours * 1.2);
      const crowdingPenalty = signal.supply * 0.08 + signal.concentration * 0.08;
      const riskMultiplier = constraints.riskTolerance === 'low' ? 1.35 : constraints.riskTolerance === 'high' ? 0.7 : 1;
      const productionPenalty = signal.informationLeadHours < 0 ? 9 : signal.informationLeadHours < constraints.maxProductionHours ? 5 : 0;

      const objectiveBoost = constraints.objective === 'engagement'
        ? signal.audienceFit * 0.05 + signal.novelty * 0.04
        : constraints.objective === 'evergreen'
          ? signal.longevity * 0.09
          : constraints.objective === 'audience_growth'
            ? signal.novelty * 0.06 + demandSupplyGap * 0.03
            : signal.demand * 0.04 + momentum * 0.03;

      const raw =
        signal.audienceFit * 0.19 +
        signal.novelty * 0.14 +
        demandSupplyGap * 0.13 +
        momentum * 0.13 +
        temporalAdvantage * 0.11 +
        signal.sourceStrength * 0.09 +
        signal.longevity * 0.08 +
        signal.demand * 0.07 +
        objectiveBoost +
        regimeBonus[signal.regime] -
        crowdingPenalty -
        signal.risk * 0.08 * riskMultiplier -
        productionPenalty;

      const score = Math.round(clamp(raw));
      const confidence = Math.round(clamp(55 + signal.sourceStrength * 0.22 + signal.audienceFit * 0.12 - Math.abs(signal.demandAcceleration) * 0.25));
      const explanation = [
        `Aderência ao público estimada em ${signal.audienceFit}/100.`,
        signal.informationLeadHours > 0 ? `Vantagem temporal demonstrativa de ${signal.informationLeadHours}h antes da saturação projetada.` : `Sinal tardio: a janela estimada já está ${Math.abs(signal.informationLeadHours)}h atrás do ponto ideal.`,
        `Demanda ${signal.demand}/100 versus oferta ${signal.supply}/100; concentração competitiva ${signal.concentration}/100.`,
        signal.regime === 'PRE_TREND' ? 'Regime favorecido: demanda acelera antes de a oferta se tornar dominante.' : `Regime atual: ${signal.regime}.`
      ];
      const risks = [
        ...(signal.supply > 70 ? ['Oferta alta; risco de mercado congestionado.'] : []),
        ...(signal.concentration > 65 ? ['Views concentradas em poucos vencedores; competição winner-take-most.'] : []),
        ...(signal.risk > 35 ? ['Risco factual/reputacional acima da média.'] : [])
      ];

      return {
        ...signal,
        rank: 0,
        score,
        confidence,
        publishWindow: signal.informationLeadHours >= constraints.maxProductionHours ? `Produzir agora; janela útil estimada > ${constraints.maxProductionHours}h.` : signal.informationLeadHours > 0 ? `Produção precisa caber em ~${signal.informationLeadHours}h.` : 'Não perseguir sem um ângulo derivado ou nova onda.',
        explanation,
        risks
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((decision, index) => ({ ...decision, rank: index + 1 }));
}
