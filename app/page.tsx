'use client';

import { FormEvent, useEffect, useState } from 'react';

type Decision = {
  id: string;
  rank: number;
  topic: string;
  angle: string;
  regime: 'PRE_TREND' | 'ACCELERATION' | 'PEAK' | 'DECLINE' | 'EVERGREEN';
  score: number;
  confidence: number;
  demand: number;
  supply: number;
  audienceFit: number;
  informationLeadHours: number;
  publishWindow: string;
  explanation: string[];
  risks: string[];
};

type ResponseShape = {
  generatedAt: string;
  mode: string;
  constraints: Record<string, unknown>;
  decisions: Decision[];
};

const regimes: Record<Decision['regime'], string> = {
  PRE_TREND: 'Pré-tendência',
  ACCELERATION: 'Aceleração',
  PEAK: 'Pico',
  DECLINE: 'Queda',
  EVERGREEN: 'Evergreen'
};

export default function Home() {
  const [data, setData] = useState<ResponseShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    objective: 'maximum_views',
    allowedTopics: 'tecnologia, economia, ciência, cultura, internet',
    forbiddenTopics: '',
    maxProductionHours: '36',
    riskTolerance: 'medium'
  });

  async function load(params = form) {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams(params).toString();
      const response = await fetch(`/api/decisions?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Falha ao calcular decisões');
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(form);
  }

  const best = data?.decisions?.[0];

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">YOUTUBE INTELLIGENCE BR · FOUNDATION v0.1</span>
          <h1>Decisor de vídeos para um mercado de atenção em movimento.</h1>
          <p className="lead">O sistema combina restrições do usuário, demanda, oferta, estágio da tendência, aderência ao canal e vantagem temporal. Nesta fase, os sinais são demonstrativos; a arquitetura já está pronta para receber dados reais.</p>
        </div>
        <div className="statusCard">
          <span className="pulse" />
          <div><strong>Sistema operacional</strong><small>{data?.mode ?? 'carregando'} · {data ? new Date(data.generatedAt).toLocaleString('pt-BR') : '—'}</small></div>
        </div>
      </header>

      <section className="grid topGrid">
        <form className="panel controls" onSubmit={submit}>
          <div className="panelTitle"><span>01</span><h2>Restrições dinâmicas</h2></div>
          <label>Objetivo<select value={form.objective} onChange={e => setForm({ ...form, objective: e.target.value })}><option value="maximum_views">Máximo de views</option><option value="engagement">Engajamento</option><option value="audience_growth">Crescimento de audiência</option><option value="evergreen">Biblioteca evergreen</option></select></label>
          <label>Assuntos permitidos<textarea value={form.allowedTopics} onChange={e => setForm({ ...form, allowedTopics: e.target.value })} /></label>
          <label>Assuntos proibidos<input value={form.forbiddenTopics} onChange={e => setForm({ ...form, forbiddenTopics: e.target.value })} placeholder="ex.: apostas, celebridades" /></label>
          <div className="twoCols"><label>Produção máxima<input type="number" min="1" max="240" value={form.maxProductionHours} onChange={e => setForm({ ...form, maxProductionHours: e.target.value })} /><small>horas</small></label><label>Risco<select value={form.riskTolerance} onChange={e => setForm({ ...form, riskTolerance: e.target.value })}><option value="low">Baixo</option><option value="medium">Médio</option><option value="high">Alto</option></select></label></div>
          <button disabled={loading}>{loading ? 'Calculando…' : 'Recalcular decisões'}</button>
          {error && <p className="error">{error}</p>}
        </form>

        <article className="panel thesis">
          <div className="panelTitle"><span>02</span><h2>Melhor decisão agora</h2></div>
          {best ? <>
            <div className="scoreRow"><div className="bigScore">{best.score}</div><div><span className={`regime ${best.regime.toLowerCase()}`}>{regimes[best.regime]}</span><p>{best.confidence}% de confiança</p></div></div>
            <h3>{best.topic}</h3><p>{best.angle}</p>
            <div className="metricGrid"><Metric label="Demanda" value={best.demand} /><Metric label="Oferta" value={best.supply} /><Metric label="Fit" value={best.audienceFit} /><Metric label="Lead" value={best.informationLeadHours} suffix="h" /></div>
            <div className="window"><span>Janela recomendada</span><strong>{best.publishWindow}</strong></div>
          </> : <Skeleton />}
        </article>
      </section>

      <section className="panel decisions">
        <div className="panelTitle"><span>03</span><h2>Fila de decisões</h2></div>
        <div className="decisionList">
          {data?.decisions.map(item => <article className="decision" key={item.id}>
            <div className="rank">#{item.rank}</div>
            <div className="decisionMain"><div className="decisionHeader"><div><span className={`regime ${item.regime.toLowerCase()}`}>{regimes[item.regime]}</span><h3>{item.topic}</h3></div><div className="compactScore">{item.score}</div></div><p>{item.angle}</p><div className="chips"><span>demanda {item.demand}</span><span>oferta {item.supply}</span><span>fit {item.audienceFit}</span><span>lead {item.informationLeadHours}h</span></div><details><summary>Por que esta decisão?</summary><ul>{item.explanation.map(x => <li key={x}>{x}</li>)}</ul>{item.risks.length > 0 && <><strong>Riscos</strong><ul>{item.risks.map(x => <li key={x}>{x}</li>)}</ul></>}</details></div>
          </article>)}
        </div>
      </section>

      <section className="grid architectureGrid">
        <article className="panel"><div className="panelTitle"><span>04</span><h2>Grafo de atenção</h2></div><div className="graphMock"><span>YouTuber</span><i>→</i><span>X / Reddit</span><i>→</i><span>Google BR</span><i>→</i><span>YouTube BR</span></div><p className="muted">Slot preparado para Neo4j: fontes, temas, plataformas, países, eventos e arestas temporais com peso, lag e confiança.</p></article>
        <article className="panel"><div className="panelTitle"><span>05</span><h2>Memória vetorial</h2></div><div className="memoryBars"><div><span>Curto prazo</span><b style={{width:'82%'}} /></div><div><span>Médio prazo</span><b style={{width:'58%'}} /></div><div><span>Longo prazo</span><b style={{width:'71%'}} /></div></div><p className="muted">Interface `VectorStore` pronta para PostgreSQL + pgvector: decisões, embeddings, feedback, desempenho e padrões persistentes do canal.</p></article>
      </section>

      <footer>Foundation build · Brasil · America/Sao_Paulo · nenhum score desta versão é apresentado como dado real de mercado.</footer>
    </main>
  );
}

function Metric({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) { return <div className="metric"><span>{label}</span><strong>{value}{suffix}</strong></div>; }
function Skeleton() { return <div className="skeleton"><i/><i/><i/></div>; }
