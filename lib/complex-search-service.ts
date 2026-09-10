import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
import { getHypeDashboard } from '@/lib/youtube-hype-service';
import { buildTopicRanking, type TopicEvidenceVideo } from '@/lib/topic-ranking';
import { enrichTopicRankingWithX, type XEnrichedTopic } from '@/lib/x-topic-service';
import { getLatestXTrendSnapshot } from '@/lib/x-trends-db';
import { getLatestComplexYoutubeSignals, type ComplexYoutubeSignal } from '@/lib/complex-search-market-db';
import type { ComplexSearchRootTopic } from '@/lib/complex-search-db';

export type ComplexSearchNodeType = 'root' | 'youtube-topic' | 'youtube-video' | 'tag' | 'x-trend';

export type ComplexSearchGraphNode = {
  id: string;
  label: string;
  type: ComplexSearchNodeType;
  sourceLabel: string;
  rootIds: string[];
  evidence: Array<{
    kind: 'youtube' | 'x';
    label: string;
    detail?: string;
    url?: string;
  }>;
};

export type ComplexSearchGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: 'contains-signal' | 'describes' | 'appears-on-x' | 'shared-context';
};

export type ComplexSearchGraph = {
  generatedAt: string;
  nodes: ComplexSearchGraphNode[];
  edges: ComplexSearchGraphEdge[];
  warnings: string[];
};

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas',
  'um', 'uma', 'uns', 'umas', 'para', 'por', 'com', 'sem', 'que', 'como', 'mais', 'menos', 'sobre',
  'hoje', 'agora', 'novo', 'nova', 'novos', 'novas', 'crise', 'caso', 'tema', 'assunto', 'brasil',
  'brasileiro', 'brasileira', '2026', 'vs'
]);

const CONCEPT_FAMILIES: string[][] = [
  ['eleicao', 'eleicoes', 'eleitoral', 'campanha', 'candidato', 'candidatura', 'presidencia', 'presidencial', 'tse'],
  ['stf', 'supremo', 'moraes', 'alexandre', 'mendonca', 'andre', 'fachin', 'edson', 'dino', 'judiciario', 'pf', 'pgr'],
  ['master', 'banco', 'financeiro', 'bancario', 'bacen', 'banco central', 'vorcaro'],
  ['inss', 'previdencia', 'aposentadoria', 'beneficio', 'desconto', 'fraude'],
  ['inteligencia artificial', 'ia', 'openai', 'chatgpt', 'gemini', 'claude', 'llm'],
  ['bitcoin', 'cripto', 'criptomoeda', 'ethereum', 'blockchain'],
  ['youtube', 'video', 'criador', 'creator', 'canal', 'algoritmo', 'hype']
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length >= 2 && !STOPWORDS.has(token)));
}

function expandedTerms(value: string): Set<string> {
  const base = tokens(value);
  const expanded = new Set(base);
  const normalized = normalize(value);

  for (const family of CONCEPT_FAMILIES) {
    if (family.some((term) => normalized.includes(normalize(term)) || base.has(normalize(term)))) {
      for (const term of family) {
        for (const token of tokens(term)) expanded.add(token);
      }
    }
  }

  return expanded;
}

function overlapCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function topicRelation(root: ComplexSearchRootTopic, topic: XEnrichedTopic): number {
  const rootTerms = expandedTerms(root.label);
  const topicText = [
    topic.label,
    ...topic.tags,
    ...topic.evidence.flatMap((item) => [item.title, item.channelTitle]),
    ...topic.xSignal.matchedTrends
  ].join(' ');
  const topicTerms = expandedTerms(topicText);
  const direct = overlapCount(tokens(root.label), tokens(topicText));
  const semantic = overlapCount(rootTerms, topicTerms);
  const phrase = normalize(topicText).includes(normalize(root.label)) || normalize(root.label).includes(normalize(topic.label));
  return direct * 4 + semantic + (phrase ? 6 : 0);
}

function videoRelation(root: ComplexSearchRootTopic, video: ComplexYoutubeSignal): number {
  const rootDirect = tokens(root.label);
  const titleDirect = tokens(video.title);
  const direct = overlapCount(rootDirect, titleDirect);
  const contextual = overlapCount(expandedTerms(root.label), expandedTerms(video.title));
  const phrase = normalize(video.title).includes(normalize(root.label));
  return direct * 5 + contextual + (phrase ? 8 : 0);
}

function trendRelation(root: ComplexSearchRootTopic, trendName: string, relatedTopics: XEnrichedTopic[]): number {
  const rootTerms = expandedTerms(root.label);
  const trendTerms = expandedTerms(trendName);
  let score = overlapCount(rootTerms, trendTerms) * 3;

  for (const topic of relatedTopics) {
    const topicTerms = expandedTerms([topic.label, ...topic.tags].join(' '));
    score += Math.min(2, overlapCount(topicTerms, trendTerms));
  }

  return score;
}

function safeId(value: string): string {
  return normalize(value).replace(/\s+/g, '-').slice(0, 90) || 'node';
}

function youtubeEvidence(video: TopicEvidenceVideo) {
  return {
    kind: 'youtube' as const,
    label: video.title,
    detail: video.channelTitle,
    url: `https://www.youtube.com/watch?v=${video.videoId}`
  };
}

function rawYoutubeEvidence(video: ComplexYoutubeSignal) {
  return {
    kind: 'youtube' as const,
    label: video.title,
    detail: video.channelTitle,
    url: `https://www.youtube.com/watch?v=${video.videoId}`
  };
}

function addNode(map: Map<string, ComplexSearchGraphNode>, node: ComplexSearchGraphNode) {
  const current = map.get(node.id);
  if (!current) {
    map.set(node.id, node);
    return;
  }

  current.rootIds = [...new Set([...current.rootIds, ...node.rootIds])];
  const evidenceKeys = new Set(current.evidence.map((item) => `${item.kind}:${item.label}:${item.detail ?? ''}`));
  for (const item of node.evidence) {
    const key = `${item.kind}:${item.label}:${item.detail ?? ''}`;
    if (!evidenceKeys.has(key)) {
      current.evidence.push(item);
      evidenceKeys.add(key);
    }
  }
}

function addEdge(map: Map<string, ComplexSearchGraphEdge>, edge: ComplexSearchGraphEdge) {
  if (!map.has(edge.id)) map.set(edge.id, edge);
}

export async function buildComplexSearchGraph(roots: ComplexSearchRootTopic[]): Promise<ComplexSearchGraph> {
  const warnings: string[] = [];
  if (!roots.length) return { generatedAt: new Date().toISOString(), nodes: [], edges: [], warnings };

  const nodes = new Map<string, ComplexSearchGraphNode>();
  const edges = new Map<string, ComplexSearchGraphEdge>();

  for (const root of roots) {
    addNode(nodes, {
      id: `root:${root.id}`,
      label: root.label,
      type: 'root',
      sourceLabel: 'Tema externo',
      rootIds: [root.id],
      evidence: []
    });
  }

  let topics: XEnrichedTopic[] = [];
  let widerYoutube: ComplexYoutubeSignal[] = [];
  try {
    const [leaders, hype, collected] = await Promise.all([
      getLeaderDashboard(),
      getHypeDashboard(),
      getLatestComplexYoutubeSignals(100)
    ]);
    widerYoutube = collected;
    const base = buildTopicRanking(leaders.leaders.slice(0, 4), hype.videos.slice(0, 4));
    topics = (await enrichTopicRankingWithX(base)).topics;
  } catch (error) {
    warnings.push(error instanceof Error ? `YouTube/X topic layer: ${error.message}` : 'YouTube/X topic layer indisponível.');
  }

  let xTrends: Array<{ name: string; rank: number; postCount: number | null }> = [];
  try {
    xTrends = (await getLatestXTrendSnapshot('BR'))?.trends ?? [];
  } catch (error) {
    warnings.push(error instanceof Error ? `X Trends: ${error.message}` : 'X Trends indisponível.');
  }

  for (const root of roots) {
    const rootNodeId = `root:${root.id}`;
    const relatedTopics = topics
      .map((topic) => ({ topic, score: topicRelation(root, topic) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.topic);

    for (const topic of relatedTopics) {
      const topicNodeId = `yt:${topic.key}`;
      addNode(nodes, {
        id: topicNodeId,
        label: topic.label,
        type: 'youtube-topic',
        sourceLabel: topic.sourceCoverage.includes('YOUTUBE_HYPE') ? 'YouTube Hype / Radar' : 'YouTube Radar',
        rootIds: [root.id],
        evidence: topic.evidence.slice(0, 3).map(youtubeEvidence)
      });
      addEdge(edges, {
        id: `${rootNodeId}->${topicNodeId}`,
        source: rootNodeId,
        target: topicNodeId,
        relation: 'contains-signal'
      });

      for (const tag of topic.tags.slice(0, 5)) {
        const tagNodeId = `tag:${safeId(tag)}`;
        addNode(nodes, {
          id: tagNodeId,
          label: tag,
          type: 'tag',
          sourceLabel: 'Entidade / tópico relacionado',
          rootIds: [root.id],
          evidence: topic.evidence.slice(0, 2).map(youtubeEvidence)
        });
        addEdge(edges, {
          id: `${topicNodeId}->${tagNodeId}`,
          source: topicNodeId,
          target: tagNodeId,
          relation: 'describes'
        });
      }

      for (const matchedTrend of topic.xSignal.matchedTrends.slice(0, 3)) {
        const trendNodeId = `x:${safeId(matchedTrend)}`;
        addNode(nodes, {
          id: trendNodeId,
          label: matchedTrend,
          type: 'x-trend',
          sourceLabel: 'X Brasil',
          rootIds: [root.id],
          evidence: [{ kind: 'x', label: matchedTrend, detail: 'Tendência relacionada detectada no X' }]
        });
        addEdge(edges, {
          id: `${topicNodeId}->${trendNodeId}`,
          source: topicNodeId,
          target: trendNodeId,
          relation: 'appears-on-x'
        });
      }
    }

    const relatedVideos = widerYoutube
      .map((video) => ({ video, score: videoRelation(root, video) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => item.video);

    for (const video of relatedVideos) {
      const videoNodeId = `video:${video.videoId}`;
      addNode(nodes, {
        id: videoNodeId,
        label: video.title,
        type: 'youtube-video',
        sourceLabel: 'Sinal YouTube · universo coletado',
        rootIds: [root.id],
        evidence: [rawYoutubeEvidence(video)]
      });
      addEdge(edges, {
        id: `${rootNodeId}->${videoNodeId}`,
        source: rootNodeId,
        target: videoNodeId,
        relation: 'contains-signal'
      });
    }

    const directTrends = xTrends
      .map((trend) => ({ trend, score: trendRelation(root, trend.name, relatedTopics) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.trend);

    for (const trend of directTrends) {
      const trendNodeId = `x:${safeId(trend.name)}`;
      addNode(nodes, {
        id: trendNodeId,
        label: trend.name,
        type: 'x-trend',
        sourceLabel: 'X Brasil',
        rootIds: [root.id],
        evidence: [{
          kind: 'x',
          label: trend.name,
          detail: trend.postCount == null ? 'Tendência observada no Brasil' : 'Tendência observada no Brasil com volume informado pelo X'
        }]
      });
      addEdge(edges, {
        id: `${rootNodeId}->${trendNodeId}`,
        source: rootNodeId,
        target: trendNodeId,
        relation: 'appears-on-x'
      });
    }
  }

  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      const left = roots[i];
      const right = roots[j];
      if (overlapCount(expandedTerms(left.label), expandedTerms(right.label)) === 0) continue;
      addEdge(edges, {
        id: `root:${left.id}->root:${right.id}`,
        source: `root:${left.id}`,
        target: `root:${right.id}`,
        relation: 'shared-context'
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    warnings
  };
}
