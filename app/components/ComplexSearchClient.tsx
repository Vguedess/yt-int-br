'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import styles from './complex-search.module.css';

type RootTopic = {
  id: string;
  label: string;
  topicKey: string;
  createdAt: string;
};

type GraphNode = {
  id: string;
  label: string;
  type: 'root' | 'youtube-topic' | 'tag' | 'x-trend';
  sourceLabel: string;
  rootIds: string[];
  evidence: Array<{
    kind: 'youtube' | 'x';
    label: string;
    detail?: string;
    url?: string;
  }>;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: 'contains-signal' | 'describes' | 'appears-on-x' | 'shared-context';
};

type Graph = {
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: string[];
};

type ApiPayload = {
  ok?: boolean;
  topics?: RootTopic[];
  graph?: Graph;
  error?: string;
};

type Position = { x: number; y: number };

const WIDTH = 1240;
const HEIGHT = 720;

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
}

function buildPositions(nodes: GraphNode[]): Map<string, Position> {
  const positions = new Map<string, Position>();
  const roots = nodes.filter((node) => node.type === 'root');
  const centerX = WIDTH / 2;
  const centerY = HEIGHT / 2;

  roots.forEach((root, index) => {
    if (roots.length === 1) {
      positions.set(root.id, { x: centerX, y: centerY });
      return;
    }

    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / roots.length;
    const radius = Math.min(245, 125 + roots.length * 18);
    positions.set(root.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  });

  const rootPositionByStoredId = new Map<string, Position>();
  for (const root of roots) {
    const position = positions.get(root.id);
    const storedId = root.id.replace(/^root:/, '');
    if (position) rootPositionByStoredId.set(storedId, position);
  }

  const grouped = new Map<string, GraphNode[]>();
  for (const node of nodes.filter((item) => item.type !== 'root')) {
    const primaryRoot = node.rootIds[0] ?? 'orphan';
    const list = grouped.get(primaryRoot) ?? [];
    list.push(node);
    grouped.set(primaryRoot, list);
  }

  for (const [rootId, children] of grouped) {
    const anchor = rootPositionByStoredId.get(rootId) ?? { x: centerX, y: centerY };
    const byType: Record<'youtube-topic' | 'tag' | 'x-trend', GraphNode[]> = {
      'youtube-topic': [],
      tag: [],
      'x-trend': []
    };

    for (const child of children) byType[child.type as keyof typeof byType].push(child);

    const place = (items: GraphNode[], radius: number, phase: number) => {
      items.forEach((item, index) => {
        const jitter = ((hash(item.id) % 31) - 15) * 0.012;
        const angle = phase + (Math.PI * 2 * index) / Math.max(items.length, 1) + jitter;
        positions.set(item.id, {
          x: Math.max(55, Math.min(WIDTH - 55, anchor.x + Math.cos(angle) * radius)),
          y: Math.max(55, Math.min(HEIGHT - 55, anchor.y + Math.sin(angle) * radius))
        });
      });
    };

    place(byType['youtube-topic'], 150, -Math.PI / 2);
    place(byType.tag, 245, Math.PI / 8);
    place(byType['x-trend'], 320, Math.PI / 3);
  }

  return positions;
}

function nodeRadius(type: GraphNode['type']): number {
  if (type === 'root') return 24;
  if (type === 'youtube-topic') return 17;
  if (type === 'x-trend') return 14;
  return 11;
}

function shortLabel(value: string): string {
  return value.length > 34 ? `${value.slice(0, 31)}…` : value;
}

export function ComplexSearchClient() {
  const [topics, setTopics] = useState<RootTopic[]>([]);
  const [graph, setGraph] = useState<Graph>({ generatedAt: '', nodes: [], edges: [], warnings: [] });
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const saved = window.sessionStorage.getItem('complex-search-secret');
    if (saved) setSecret(saved);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/complex-search', { cache: 'no-store' });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.ok || !payload.topics || !payload.graph) {
        throw new Error(payload.error ?? 'Falha ao carregar o grafo.');
      }
      setTopics(payload.topics);
      setGraph(payload.graph);
      if (selectedId && !payload.graph.nodes.some((node) => node.id === selectedId)) setSelectedId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar o ComplexSearch.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanLabel = label.replace(/\s+/g, ' ').trim();
    if (cleanLabel.length < 2) {
      setMessage('Digite um tema com pelo menos 2 caracteres.');
      return;
    }
    if (!secret.trim()) {
      setMessage('Informe a chave administrativa para gravar temas.');
      return;
    }

    setMutating(true);
    setMessage('');
    try {
      window.sessionStorage.setItem('complex-search-secret', secret.trim());
      const response = await fetch('/api/complex-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret.trim()}`
        },
        body: JSON.stringify({ label: cleanLabel })
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.ok) {
        if (payload.error === 'unauthorized') throw new Error('Chave administrativa inválida.');
        throw new Error(payload.error ?? 'Falha ao adicionar tema.');
      }
      setLabel('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao adicionar tema.');
    } finally {
      setMutating(false);
    }
  }

  async function removeTopic(id: string) {
    if (!secret.trim()) {
      setMessage('Informe a chave administrativa para excluir temas.');
      return;
    }

    setMutating(true);
    setMessage('');
    try {
      window.sessionStorage.setItem('complex-search-secret', secret.trim());
      const response = await fetch('/api/complex-search', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret.trim()}`
        },
        body: JSON.stringify({ id })
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.ok) {
        if (payload.error === 'unauthorized') throw new Error('Chave administrativa inválida.');
        throw new Error(payload.error ?? 'Falha ao excluir tema.');
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao excluir tema.');
    } finally {
      setMutating(false);
    }
  }

  const positions = useMemo(() => buildPositions(graph.nodes), [graph.nodes]);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;
  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>([selectedId]);
    for (const edge of graph.edges) {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    }
    return ids;
  }, [graph.edges, selectedId]);

  return (
    <div className={styles.workspace}>
      <section className={styles.controlPanel}>
        <div className={styles.controlCopy}>
          <span className={styles.eyebrow}>EXTERNAL SEEDS → YOUTUBE / X GRAPH</span>
          <h1>ComplexSearch</h1>
          <p>Adicione temas grandes ou notórios que você quer acompanhar. O sistema mantém esses temas como âncoras e conecta os sinais que aparecem no radar do YouTube e nas tendências do X.</p>
        </div>

        <form className={styles.form} onSubmit={addTopic}>
          <label className={styles.topicInput}>
            <span>Tema externo</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex.: Eleições 2026, Crise do STF, Mendonça vs Moraes, Fachin"
              maxLength={120}
              disabled={mutating}
            />
          </label>
          <label className={styles.secretInput}>
            <span>Chave administrativa</span>
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="COMPLEX_SEARCH_SECRET / chave do projeto"
              disabled={mutating}
            />
          </label>
          <button type="submit" disabled={mutating || !label.trim()}>
            {mutating ? 'Atualizando…' : 'Adicionar ao grafo'}
          </button>
        </form>

        {topics.length ? (
          <div className={styles.savedTopics}>
            {topics.map((topic) => (
              <div className={styles.savedTopic} key={topic.id}>
                <span>{topic.label}</span>
                <button type="button" onClick={() => void removeTopic(topic.id)} disabled={mutating} aria-label={`Excluir ${topic.label}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyHint}>Nenhum tema externo salvo ainda.</div>
        )}
        {message ? <div className={styles.message}>{message}</div> : null}
      </section>

      <section className={styles.graphShell}>
        <div className={styles.graphHeader}>
          <div>
            <span className={styles.eyebrow}>MAPA DE CONTEXTO</span>
            <strong>{graph.nodes.length} nós · {graph.edges.length} conexões</strong>
          </div>
          <div className={styles.zoomControls}>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.68, value - 0.12))}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.45, value + 0.12))}>+</button>
            <button type="button" onClick={() => setZoom(1)}>Reset</button>
          </div>
        </div>

        <div className={styles.legend}>
          <span><i className={styles.rootDot} />Tema externo</span>
          <span><i className={styles.youtubeDot} />Cluster YouTube</span>
          <span><i className={styles.tagDot} />Entidade / tópico</span>
          <span><i className={styles.xDot} />Tendência X</span>
        </div>

        <div className={styles.canvas}>
          {loading ? <div className={styles.loading}>Atualizando conexões…</div> : null}
          {!loading && graph.nodes.length === 0 ? (
            <div className={styles.blankState}>
              <strong>O grafo começa com um tema externo.</strong>
              <span>Adicione uma âncora acima. Ela continuará salva até você excluí-la.</span>
            </div>
          ) : null}
          {graph.nodes.length ? (
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Grafo de temas relacionados" className={styles.graphSvg}>
              <g transform={`translate(${WIDTH * (1 - zoom) / 2} ${HEIGHT * (1 - zoom) / 2}) scale(${zoom})`}>
                {graph.edges.map((edge) => {
                  const from = positions.get(edge.source);
                  const to = positions.get(edge.target);
                  if (!from || !to) return null;
                  const highlighted = !selectedId || edge.source === selectedId || edge.target === selectedId;
                  return (
                    <line
                      key={edge.id}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      className={highlighted ? styles.edge : styles.edgeMuted}
                    />
                  );
                })}

                {graph.nodes.map((node) => {
                  const position = positions.get(node.id);
                  if (!position) return null;
                  const active = selectedId === node.id;
                  const muted = Boolean(selectedId) && !connectedIds.has(node.id);
                  return (
                    <g
                      key={node.id}
                      className={`${styles.node} ${styles[node.type.replace('-', '') as 'root' | 'youtubetopic' | 'tag' | 'xtrend']} ${active ? styles.nodeActive : ''} ${muted ? styles.nodeMuted : ''}`}
                      transform={`translate(${position.x} ${position.y})`}
                      onClick={() => setSelectedId((current) => current === node.id ? null : node.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedId((current) => current === node.id ? null : node.id);
                      }}
                    >
                      <circle r={nodeRadius(node.type)} />
                      <text x={nodeRadius(node.type) + 8} y={4}>{shortLabel(node.label)}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : null}
        </div>

        {graph.warnings.length ? (
          <div className={styles.warnings}>{graph.warnings.join(' · ')}</div>
        ) : null}
      </section>

      <aside className={styles.inspector}>
        {selected ? (
          <>
            <span className={styles.eyebrow}>NÓ SELECIONADO</span>
            <h2>{selected.label}</h2>
            <p className={styles.source}>{selected.sourceLabel}</p>
            {selected.evidence.length ? (
              <div className={styles.evidenceList}>
                <strong>Evidências da conexão</strong>
                {selected.evidence.slice(0, 5).map((item, index) => (
                  <div className={styles.evidence} key={`${item.kind}-${item.label}-${index}`}>
                    <span>{item.kind === 'youtube' ? 'YouTube' : 'X'}</span>
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer">{item.label}</a>
                    ) : <b>{item.label}</b>}
                    {item.detail ? <small>{item.detail}</small> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.noEvidence}>Este é um tema-raiz inserido externamente. As conexões aparecem quando sinais relacionados entram no radar.</p>
            )}
          </>
        ) : (
          <>
            <span className={styles.eyebrow}>COMO LER</span>
            <h2>Selecione um nó</h2>
            <p>Clique em qualquer ponto do grafo para destacar sua vizinhança e ver quais vídeos ou tendências sustentam a conexão.</p>
          </>
        )}
      </aside>
    </div>
  );
}
