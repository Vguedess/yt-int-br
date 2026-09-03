'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SCRIPT_BLOCK_ROLE_LABELS,
  SCRIPT_EMOTIONS,
  createBlankDraft,
  evaluateScriptDraft,
  type ScriptBlock,
  type ScriptBlockRole,
  type ScriptDraft,
  type ScriptEmotion
} from '@/lib/script-studio';
import styles from '@/app/studio/studio.module.css';

const STORAGE_KEY = 'yt-int-br:script-studio:v1';

export type StudioTopicSeed = {
  key: string;
  label: string;
  tags: string[];
  rank: number;
  opportunityScore: number;
  momentumScore: number;
  saturationScore: number;
  breakoutScore: number;
  xMomentumScore: number | null;
  xTrendRank: number | null;
  xPosts24h: number | null;
};

function numberCompact(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function blockId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function scoreClass(score: number): string {
  if (score >= 78) return styles.scoreStrong;
  if (score >= 58) return styles.scoreMid;
  return styles.scoreWeak;
}

export function ScriptStudio({ initialTopics }: { initialTopics: StudioTopicSeed[] }) {
  const initialTopic = initialTopics[0] ? { key: initialTopics[0].key, label: initialTopics[0].label } : undefined;
  const [draft, setDraft] = useState<ScriptDraft>(() => createBlankDraft(initialTopic));
  const [saveState, setSaveState] = useState('Rascunho local');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ScriptDraft>;
        if (Array.isArray(parsed.blocks)) {
          setDraft({ ...createBlankDraft(initialTopic), ...parsed, blocks: parsed.blocks as ScriptBlock[] });
        }
      }
    } catch {
      // Keep a fresh draft when local storage is malformed or blocked.
    } finally {
      setLoaded(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded) return;
    setSaveState('Salvando…');
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        setSaveState('Salvo neste navegador');
      } catch {
        setSaveState('Não foi possível salvar localmente');
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, loaded]);

  const evaluation = useMemo(() => evaluateScriptDraft(draft), [draft]);
  const selectedTopic = initialTopics.find((topic) => topic.key === draft.topicKey) ?? null;

  function patchDraft(patch: Partial<ScriptDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function selectTopic(topic: StudioTopicSeed) {
    setDraft((current) => ({
      ...current,
      topicKey: topic.key,
      topicLabel: topic.label,
      titleIdea: current.titleIdea || topic.label
    }));
  }

  function patchBlock(id: string, patch: Partial<ScriptBlock>) {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } : block)
    }));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= draft.blocks.length) return;
    setDraft((current) => {
      const next = [...current.blocks];
      const [moved] = next.splice(index, 1);
      next.splice(destination, 0, moved);
      return { ...current, blocks: next };
    });
  }

  function addBlock() {
    const newBlock: ScriptBlock = {
      id: blockId(),
      title: 'Novo bloco',
      role: 'EVIDENCE',
      text: '',
      targetEmotion: 'curiosidade',
      estimatedSeconds: 75
    };
    setDraft((current) => ({ ...current, blocks: [...current.blocks, newBlock] }));
  }

  function duplicateBlock(block: ScriptBlock, index: number) {
    setDraft((current) => {
      const next = [...current.blocks];
      next.splice(index + 1, 0, { ...block, id: blockId(), title: `${block.title} · cópia` });
      return { ...current, blocks: next };
    });
  }

  function removeBlock(id: string) {
    setDraft((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== id) }));
  }

  function resetDraft() {
    const topic = selectedTopic ? { key: selectedTopic.key, label: selectedTopic.label } : initialTopic;
    setDraft(createBlankDraft(topic));
  }

  return (
    <div className={styles.studioShell}>
      <section className={styles.topicPanel} aria-labelledby="topic-source-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.step}>01 · SINAL</span>
            <h2 id="topic-source-heading">Escolha o tema de partida</h2>
            <p>Use o ranking atual como sinal, não como ordem automática de produção. Saturação alta pode tornar um tema pior mesmo quando a atenção absoluta é grande.</p>
          </div>
          <span className={styles.saveState}>{saveState}</span>
        </div>

        <div className={styles.topicGrid}>
          {initialTopics.map((topic) => (
            <button
              type="button"
              key={topic.key}
              onClick={() => selectTopic(topic)}
              className={`${styles.topicCard} ${draft.topicKey === topic.key ? styles.topicCardActive : ''}`}
            >
              <div className={styles.topicTopline}><strong>#{topic.rank}</strong><span>Oportunidade {topic.opportunityScore}</span></div>
              <h3>{topic.label}</h3>
              <div className={styles.topicTags}>{topic.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
              <dl className={styles.topicStats}>
                <div><dt>Momentum</dt><dd>{topic.momentumScore}</dd></div>
                <div><dt>Breakout</dt><dd>{topic.breakoutScore}</dd></div>
                <div><dt>Saturação</dt><dd>{topic.saturationScore}</dd></div>
                <div><dt>X</dt><dd>{topic.xMomentumScore ?? '—'}</dd></div>
              </dl>
              <small>{topic.xTrendRank ? `X Brasil #${topic.xTrendRank}` : 'Fora do Top 50 do X'} · {numberCompact(topic.xPosts24h)} posts/24h em português</small>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.workspace}>
        <div className={styles.editorColumn}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><span className={styles.step}>02 · NÚCLEO</span><h2>Defina o que o vídeo realmente está dizendo</h2></div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fieldWide}><span>Título provisório</span><input value={draft.titleIdea} onChange={(event) => patchDraft({ titleIdea: event.target.value })} placeholder="Um título de trabalho, não precisa ser o título final" /></label>
              <label><span>Tema</span><input value={draft.topicLabel} onChange={(event) => patchDraft({ topicLabel: event.target.value })} /></label>
              <label><span>Meta de duração</span><div className={styles.inlineInput}><input type="number" min="4" max="90" value={draft.targetMinutes} onChange={(event) => patchDraft({ targetMinutes: Number(event.target.value) || 1 })} /><em>min</em></div></label>
              <label className={styles.fieldWide}><span>Núcleo do conteúdo</span><textarea value={draft.contentCore} onChange={(event) => patchDraft({ contentCore: event.target.value })} placeholder="Quais fatos, mecanismos, conflitos ou ideias precisam estar necessariamente no vídeo?" rows={4} /></label>
              <label className={styles.fieldWide}><span>Tese em uma frase</span><textarea value={draft.thesis} onChange={(event) => patchDraft({ thesis: event.target.value })} placeholder="Depois de assistir, qual ideia central o espectador deveria ser capaz de repetir?" rows={3} /></label>
              <label className={styles.fieldWide}><span>Promessa para o espectador</span><textarea value={draft.viewerPromise} onChange={(event) => patchDraft({ viewerPromise: event.target.value })} placeholder="O que ele entenderá, descobrirá ou será capaz de enxergar até o final?" rows={3} /></label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><span className={styles.step}>03 · COMUNICAÇÃO</span><h2>Planeje a experiência, não apenas a informação</h2></div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fieldWide}><span>Público-alvo</span><textarea rows={2} value={draft.targetAudience} onChange={(event) => patchDraft({ targetAudience: event.target.value })} /></label>
              <label className={styles.fieldWide}><span>Resposta emocional desejada</span><textarea rows={2} value={draft.desiredEmotion} onChange={(event) => patchDraft({ desiredEmotion: event.target.value })} /></label>
              <label className={styles.fieldWide}><span>Tom e linguagem</span><textarea rows={2} value={draft.tone} onChange={(event) => patchDraft({ tone: event.target.value })} /></label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.step}>04 · ARQUITETURA NARRATIVA</span>
                <h2>Ordene o roteiro como unidades de atenção</h2>
                <p>Cada bloco deve ter uma função cognitiva. Reordene para evitar longos trechos com o mesmo tipo de estímulo.</p>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={addBlock}>+ Adicionar bloco</button>
            </div>

            <div className={styles.blockList}>
              {draft.blocks.map((block, index) => (
                <article className={styles.scriptBlock} key={block.id}>
                  <div className={styles.blockIndex}>{String(index + 1).padStart(2, '0')}</div>
                  <div className={styles.blockMain}>
                    <div className={styles.blockControls}>
                      <input className={styles.blockTitle} value={block.title} onChange={(event) => patchBlock(block.id, { title: event.target.value })} aria-label={`Nome do bloco ${index + 1}`} />
                      <select value={block.role} onChange={(event) => patchBlock(block.id, { role: event.target.value as ScriptBlockRole })}>
                        {Object.entries(SCRIPT_BLOCK_ROLE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                      <select value={block.targetEmotion} onChange={(event) => patchBlock(block.id, { targetEmotion: event.target.value as ScriptEmotion })}>
                        {SCRIPT_EMOTIONS.map((emotion) => <option key={emotion} value={emotion}>{emotion}</option>)}
                      </select>
                      <div className={styles.secondsInput}><input type="number" min="10" max="900" value={block.estimatedSeconds} onChange={(event) => patchBlock(block.id, { estimatedSeconds: Number(event.target.value) || 0 })} /><span>s</span></div>
                    </div>
                    <textarea
                      rows={5}
                      value={block.text}
                      onChange={(event) => patchBlock(block.id, { text: event.target.value })}
                      placeholder="Escreva ideias, dados, frases-chave ou texto corrido. O bloco pode ser reorganizado depois."
                    />
                    <div className={styles.blockActions}>
                      <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0}>↑ Subir</button>
                      <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === draft.blocks.length - 1}>↓ Descer</button>
                      <button type="button" onClick={() => duplicateBlock(block, index)}>Duplicar</button>
                      <button type="button" onClick={() => removeBlock(block.id)} className={styles.dangerButton}>Excluir</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className={styles.evaluationColumn}>
          <section className={`${styles.panel} ${styles.stickyPanel}`}>
            <div className={styles.sectionHeading}>
              <div><span className={styles.step}>05 · AVALIAÇÃO</span><h2>Qualidade do roteiro</h2></div>
            </div>

            <div className={styles.scoreHero}>
              <div className={`${styles.scoreCircle} ${scoreClass(evaluation.overallScore)}`}><strong>{evaluation.overallScore}</strong><span>/100</span></div>
              <div><strong>Score composto</strong><span>Objetivo {evaluation.objectiveScore} · Subjetivo {evaluation.subjectiveScore}</span><span>{evaluation.estimatedMinutes.toFixed(1)} min · {evaluation.wordCount} palavras escritas</span></div>
            </div>

            <div className={styles.metricList}>
              {evaluation.metrics.map((metric) => (
                <div className={styles.metric} key={metric.key} title={metric.reason}>
                  <div><span>{metric.label}</span><strong>{metric.score}</strong></div>
                  <div className={styles.metricBar}><span className={scoreClass(metric.score)} style={{ width: `${metric.score}%` }} /></div>
                  <small>{metric.kind === 'objective' ? 'objetivo' : 'subjetivo'} · {metric.reason}</small>
                </div>
              ))}
            </div>

            <div className={styles.retentionMap}>
              <h3>Mapa de retenção planejado</h3>
              <div>{draft.blocks.map((block, index) => <span key={block.id} title={`${SCRIPT_BLOCK_ROLE_LABELS[block.role]} · ${block.targetEmotion} · ${block.estimatedSeconds}s`}>{index + 1}</span>)}</div>
              <small>Procure alternar explicação, tensão, prova, surpresa e respiro. Muitos blocos iguais em sequência criam fadiga.</small>
            </div>

            {evaluation.strengths.length ? <div className={styles.feedbackBox}><h3>Pontos fortes</h3>{evaluation.strengths.map((item) => <p key={item}>{item}</p>)}</div> : null}
            {evaluation.warnings.length ? <div className={`${styles.feedbackBox} ${styles.warningBox}`}><h3>O que revisar</h3>{evaluation.warnings.map((item) => <p key={item}>{item}</p>)}</div> : null}

            <button type="button" className={styles.resetButton} onClick={resetDraft}>Novo roteiro a partir deste tema</button>
          </section>
        </aside>
      </div>
    </div>
  );
}
