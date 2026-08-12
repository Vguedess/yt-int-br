import { demoSignals } from '@/lib/demo-signals';
import { rankDecisions } from '@/lib/decision-engine';
import type { DecisionConstraints } from '@/lib/domain';

export const dynamic = 'force-dynamic';

function list(value: string | null) {
  return (value ?? '').split(',').map(v => v.trim()).filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const maxHours = Number(url.searchParams.get('maxProductionHours') ?? 36);
  const risk = url.searchParams.get('riskTolerance');
  const constraints: DecisionConstraints = {
    objective: url.searchParams.get('objective') ?? 'maximum_views',
    allowedTopics: list(url.searchParams.get('allowedTopics')),
    forbiddenTopics: list(url.searchParams.get('forbiddenTopics')),
    maxProductionHours: Number.isFinite(maxHours) ? Math.min(240, Math.max(1, maxHours)) : 36,
    riskTolerance: risk === 'low' || risk === 'high' ? risk : 'medium'
  };

  return Response.json({
    generatedAt: new Date().toISOString(),
    mode: 'foundation-demo-signals',
    disclaimer: 'Ranking demonstrativo. Os sinais ainda não representam dados atuais de mercado.',
    constraints,
    decisions: rankDecisions(demoSignals, constraints)
  });
}
