export type ScriptBlockRole =
  | 'HOOK'
  | 'PROMISE'
  | 'CONTEXT'
  | 'EVIDENCE'
  | 'COUNTERPOINT'
  | 'SURPRISE'
  | 'RELIEF'
  | 'PAYOFF'
  | 'CTA';

export type ScriptEmotion =
  | 'curiosidade'
  | 'tensão'
  | 'surpresa'
  | 'indignação'
  | 'divertimento'
  | 'confiança'
  | 'reflexão'
  | 'alívio';

export type ScriptBlock = {
  id: string;
  title: string;
  role: ScriptBlockRole;
  text: string;
  targetEmotion: ScriptEmotion;
  estimatedSeconds: number;
};

export type ScriptDraft = {
  topicKey: string;
  topicLabel: string;
  titleIdea: string;
  contentCore: string;
  thesis: string;
  viewerPromise: string;
  targetAudience: string;
  desiredEmotion: string;
  tone: string;
  targetMinutes: number;
  blocks: ScriptBlock[];
};

export type EvaluationMetric = {
  key: string;
  label: string;
  score: number;
  kind: 'objective' | 'subjective';
  reason: string;
};

export type ScriptEvaluation = {
  overallScore: number;
  objectiveScore: number;
  subjectiveScore: number;
  estimatedMinutes: number;
  wordCount: number;
  metrics: EvaluationMetric[];
  strengths: string[];
  warnings: string[];
};

export const SCRIPT_BLOCK_ROLE_LABELS: Record<ScriptBlockRole, string> = {
  HOOK: 'Hook / abertura',
  PROMISE: 'Promessa / contrato',
  CONTEXT: 'Contexto',
  EVIDENCE: 'Evidência / demonstração',
  COUNTERPOINT: 'Contraponto',
  SURPRISE: 'Virada / surpresa',
  RELIEF: 'Quebra-gelo / respiro',
  PAYOFF: 'Payoff / conclusão',
  CTA: 'CTA / continuação'
};

export const SCRIPT_EMOTIONS: ScriptEmotion[] = [
  'curiosidade',
  'tensão',
  'surpresa',
  'indignação',
  'divertimento',
  'confiança',
  'reflexão',
  'alívio'
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function sentences(text: string): string[] {
  return text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
}

function containsAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function createStarterBlocks(): ScriptBlock[] {
  return [
    {
      id: 'hook',
      title: 'Abertura que cria uma lacuna',
      role: 'HOOK',
      text: '',
      targetEmotion: 'curiosidade',
      estimatedSeconds: 35
    },
    {
      id: 'promise',
      title: 'Promessa e pergunta central',
      role: 'PROMISE',
      text: '',
      targetEmotion: 'curiosidade',
      estimatedSeconds: 45
    },
    {
      id: 'context',
      title: 'Contexto mínimo necessário',
      role: 'CONTEXT',
      text: '',
      targetEmotion: 'confiança',
      estimatedSeconds: 100
    },
    {
      id: 'evidence',
      title: 'Evidência que sustenta a tese',
      role: 'EVIDENCE',
      text: '',
      targetEmotion: 'confiança',
      estimatedSeconds: 150
    },
    {
      id: 'counterpoint',
      title: 'Contraponto ou explicação concorrente',
      role: 'COUNTERPOINT',
      text: '',
      targetEmotion: 'reflexão',
      estimatedSeconds: 110
    },
    {
      id: 'surprise',
      title: 'Virada que muda a leitura',
      role: 'SURPRISE',
      text: '',
      targetEmotion: 'surpresa',
      estimatedSeconds: 90
    },
    {
      id: 'relief',
      title: 'Quebra-gelo / respiro cognitivo',
      role: 'RELIEF',
      text: '',
      targetEmotion: 'divertimento',
      estimatedSeconds: 45
    },
    {
      id: 'payoff',
      title: 'Payoff: o que o espectador entende agora',
      role: 'PAYOFF',
      text: '',
      targetEmotion: 'reflexão',
      estimatedSeconds: 95
    },
    {
      id: 'cta',
      title: 'Fechamento e próxima pergunta',
      role: 'CTA',
      text: '',
      targetEmotion: 'curiosidade',
      estimatedSeconds: 30
    }
  ];
}

export function createBlankDraft(topic?: { key: string; label: string }): ScriptDraft {
  return {
    topicKey: topic?.key ?? '',
    topicLabel: topic?.label ?? '',
    titleIdea: '',
    contentCore: '',
    thesis: '',
    viewerPromise: '',
    targetAudience: 'Adultos jovens, curiosos e interessados em compreender temas de alta atenção com mais profundidade.',
    desiredEmotion: 'Curiosidade crescente, surpresa e sensação de ter entendido algo que antes parecia fragmentado.',
    tone: 'Analítico, direto, acessível, com energia e momentos pontuais de humor.',
    targetMinutes: 12,
    blocks: createStarterBlocks()
  };
}

export function evaluateScriptDraft(draft: ScriptDraft): ScriptEvaluation {
  const fullText = [draft.titleIdea, draft.contentCore, draft.thesis, draft.viewerPromise, ...draft.blocks.map((block) => block.text)].join(' ');
  const blockText = draft.blocks.map((block) => block.text.trim()).filter(Boolean).join(' ');
  const totalWords = words(blockText).length;
  const estimatedSeconds = draft.blocks.reduce((sum, block) => sum + Math.max(0, Number(block.estimatedSeconds) || 0), 0);
  const estimatedMinutes = estimatedSeconds / 60;
  const targetMinutes = Math.max(1, draft.targetMinutes || 1);
  const durationDelta = Math.abs(estimatedMinutes - targetMinutes) / targetMinutes;

  const roles = new Set(draft.blocks.map((block) => block.role));
  const firstRole = draft.blocks[0]?.role;
  const lastRoles = draft.blocks.slice(-2).map((block) => block.role);
  const filledBlocks = draft.blocks.filter((block) => block.text.trim().length >= 20);
  const oversizedBlocks = draft.blocks.filter((block) => block.estimatedSeconds > 180);
  const emotions = new Set(draft.blocks.map((block) => block.targetEmotion));
  const questionCount = (fullText.match(/\?/g) ?? []).length;
  const directAddress = containsAny(fullText, ['você', 'vocês', 'imagine', 'pensa comigo', 'repara']);
  const contrastLanguage = containsAny(fullText, ['mas ', 'porém', 'só que', 'ao contrário', 'o problema é', 'o estranho é', 'a diferença é']);
  const curiosityLanguage = containsAny(fullText, ['por que', 'como ', 'o que acontece', 'ninguém', 'parece', 'segredo', 'detalhe', 'surpresa', 'estranho']);
  const humorLanguage = containsAny(fullText, ['ironia', 'engraçado', 'piada', 'absurdo', 'ridículo', 'curioso', 'imagina']);
  const evidenceLanguage = containsAny(fullText, ['dados', 'pesquisa', 'número', 'segundo', 'fonte', 'relatório', 'estudo', '%']);

  const sentenceLengths = sentences(blockText).map((sentence) => words(sentence).length).filter(Boolean);
  const avgSentenceLength = average(sentenceLengths);
  const sentenceScore = avgSentenceLength === 0
    ? 25
    : avgSentenceLength <= 22
      ? 100
      : avgSentenceLength <= 30
        ? 78
        : avgSentenceLength <= 38
          ? 58
          : 38;

  const structureScore = clampScore(
    (firstRole === 'HOOK' ? 24 : 6) +
    (roles.has('PROMISE') ? 12 : 0) +
    (roles.has('EVIDENCE') ? 14 : 0) +
    (roles.has('COUNTERPOINT') ? 10 : 0) +
    (roles.has('SURPRISE') ? 10 : 0) +
    (roles.has('RELIEF') ? 8 : 0) +
    (roles.has('PAYOFF') ? 14 : 0) +
    (lastRoles.some((role) => role === 'PAYOFF' || role === 'CTA') ? 8 : 0)
  );

  const durationScore = clampScore(100 - durationDelta * 110 - oversizedBlocks.length * 8);
  const completionScore = clampScore((filledBlocks.length / Math.max(1, draft.blocks.length)) * 100);
  const specificityScore = clampScore(
    (draft.contentCore.trim().length >= 80 ? 22 : draft.contentCore.trim().length / 80 * 22) +
    (draft.thesis.trim().length >= 60 ? 22 : draft.thesis.trim().length / 60 * 22) +
    (draft.viewerPromise.trim().length >= 50 ? 18 : draft.viewerPromise.trim().length / 50 * 18) +
    (evidenceLanguage ? 20 : 5) +
    (roles.has('EVIDENCE') ? 18 : 0)
  );

  const clarityScore = clampScore(
    sentenceScore * 0.45 +
    (draft.thesis.trim() ? 22 : 0) +
    (draft.contentCore.trim() ? 18 : 0) +
    (draft.viewerPromise.trim() ? 15 : 0)
  );

  const curiosityScore = clampScore(
    (firstRole === 'HOOK' ? 24 : 8) +
    Math.min(24, questionCount * 8) +
    (roles.has('SURPRISE') ? 20 : 0) +
    (contrastLanguage ? 16 : 0) +
    (curiosityLanguage ? 16 : 0)
  );

  const emotionalScore = clampScore(
    Math.min(42, emotions.size * 8) +
    (draft.desiredEmotion.trim().length > 30 ? 22 : 8) +
    (roles.has('SURPRISE') ? 12 : 0) +
    (roles.has('RELIEF') ? 10 : 0) +
    (roles.has('PAYOFF') ? 14 : 0)
  );

  const engagementScore = clampScore(
    (directAddress ? 24 : 8) +
    Math.min(22, questionCount * 6) +
    (roles.has('COUNTERPOINT') ? 16 : 0) +
    (roles.has('CTA') ? 14 : 0) +
    (contrastLanguage ? 12 : 0) +
    (roles.has('RELIEF') ? 12 : 0)
  );

  const entertainmentScore = clampScore(
    (roles.has('RELIEF') ? 38 : 10) +
    (humorLanguage ? 24 : 8) +
    (roles.has('SURPRISE') ? 18 : 6) +
    (emotions.has('divertimento') ? 20 : 6)
  );

  const languageScore = clampScore(sentenceScore * 0.65 + (draft.tone.trim() ? 20 : 8) + (directAddress ? 15 : 8));

  const metrics: EvaluationMetric[] = [
    { key: 'structure', label: 'Estrutura de retenção', score: structureScore, kind: 'objective', reason: 'Posição e presença de hook, promessa, evidência, contraponto, virada, respiro, payoff e CTA.' },
    { key: 'duration', label: 'Controle de duração', score: durationScore, kind: 'objective', reason: `${estimatedMinutes.toFixed(1)} min estimados para uma meta de ${targetMinutes} min; blocos longos demais reduzem a nota.` },
    { key: 'completion', label: 'Completude dos blocos', score: completionScore, kind: 'objective', reason: `${filledBlocks.length}/${draft.blocks.length} blocos têm conteúdo suficiente para avaliação.` },
    { key: 'specificity', label: 'Especificidade e evidência', score: specificityScore, kind: 'objective', reason: 'Verifica se núcleo, tese, promessa e evidências estão concretos em vez de genéricos.' },
    { key: 'clarity', label: 'Clareza', score: clarityScore, kind: 'subjective', reason: avgSentenceLength ? `Frases com média de ${avgSentenceLength.toFixed(1)} palavras e presença de tese/promessa explícitas.` : 'Ainda não há texto suficiente para medir fluidez.' },
    { key: 'language', label: 'Linguagem efetiva', score: languageScore, kind: 'subjective', reason: 'Combina legibilidade, tom definido e proximidade com o espectador.' },
    { key: 'emotion', label: 'Resposta emocional', score: emotionalScore, kind: 'subjective', reason: `${emotions.size} estados emocionais planejados ao longo dos blocos.` },
    { key: 'engagement', label: 'Engajamento', score: engagementScore, kind: 'subjective', reason: 'Perguntas, contraste, endereçamento direto, contraponto e convite à continuidade.' },
    { key: 'curiosity', label: 'Curiosidade', score: curiosityScore, kind: 'subjective', reason: 'Mede lacunas de informação, perguntas, viradas e linguagem de descoberta.' },
    { key: 'entertainment', label: 'Divertimento / quebra-gelo', score: entertainmentScore, kind: 'subjective', reason: 'Procura respiros cognitivos, leveza e mudança de ritmo sem transformar o vídeo em conteúdo raso.' }
  ];

  const objectiveMetrics = metrics.filter((metric) => metric.kind === 'objective');
  const subjectiveMetrics = metrics.filter((metric) => metric.kind === 'subjective');
  const objectiveScore = clampScore(average(objectiveMetrics.map((metric) => metric.score)));
  const subjectiveScore = clampScore(average(subjectiveMetrics.map((metric) => metric.score)));
  const overallScore = clampScore(objectiveScore * 0.45 + subjectiveScore * 0.55);

  const strengths = metrics.filter((metric) => metric.score >= 78).sort((a, b) => b.score - a.score).slice(0, 4).map((metric) => `${metric.label}: ${metric.score}/100`);
  const warnings: string[] = [];
  if (firstRole !== 'HOOK') warnings.push('O primeiro bloco deveria funcionar como hook e criar uma lacuna antes de entregar contexto.');
  if (!roles.has('PAYOFF')) warnings.push('Falta um payoff claro: o espectador precisa receber a resposta prometida no início.');
  if (!roles.has('RELIEF')) warnings.push('Não há quebra-gelo/respiro planejado; vídeos densos tendem a perder ritmo sem mudança cognitiva.');
  if (questionCount < 2) warnings.push('Há poucas perguntas explícitas. Use perguntas como pontes, não apenas como decoração retórica.');
  if (durationDelta > 0.25) warnings.push(`A duração estimada (${estimatedMinutes.toFixed(1)} min) está distante da meta (${targetMinutes} min).`);
  if (oversizedBlocks.length) warnings.push(`${oversizedBlocks.length} bloco(s) passam de 3 minutos; considere quebrá-los para criar novas unidades de atenção.`);
  if (!draft.thesis.trim()) warnings.push('Defina a tese em uma frase verificável antes de expandir o roteiro.');
  if (!draft.viewerPromise.trim()) warnings.push('Defina o que o espectador ganhará até o final do vídeo.');

  return {
    overallScore,
    objectiveScore,
    subjectiveScore,
    estimatedMinutes,
    wordCount: totalWords,
    metrics,
    strengths,
    warnings
  };
}
