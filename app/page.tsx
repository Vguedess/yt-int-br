import Image from 'next/image';
import { getCurrentPopularity, type MacroRadar, type PopularVideo } from '@/lib/youtube-popularity';

export const revalidate = 3600;

const compactNumber = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1
});

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes} min`;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(value < 0.01 ? 1 : 0)}%`;
}

function nodeTierLabel(video: PopularVideo): string {
  if (video.nodeTier === 'PERIPHERAL') return '≤1M · periférico';
  if (video.nodeTier === 'MEDIUM') return '1–5M · médio';
  if (video.nodeTier === 'LARGE') return '5–15M · grande';
  if (video.nodeTier === 'HUB') return '>15M · hub';
  return 'nó desconhecido';
}

function VideoRow({ video, rank }: { video: PopularVideo; rank: number }) {
  return (
    <a className="videoRow" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">
      <span className="rank">{rank.toString().padStart(2, '0')}</span>
      <div className="thumbWrap">
        {video.thumbnailUrl ? (
          <Image className="thumbnail" src={video.thumbnailUrl} alt="" width={240} height={135} sizes="120px" />
        ) : <div className="thumbnailFallback" />}
      </div>
      <div className="videoCopy">
        <strong>{video.title}</strong>
        <span>{video.channelTitle}</span>
        <div className="videoMeta">
          <span>{compactNumber.format(video.views)} views</span>
          <span>{compactNumber.format(Math.round(video.viewsPerHour))} views/h</span>
          <span>{video.ageHours.toFixed(video.ageHours < 10 ? 1 : 0)}h no ar</span>
          <span>{formatDuration(video.durationSeconds)}</span>
          <span>{formatPercent(video.engagementRate)} eng.</span>
          <span>{nodeTierLabel(video)}</span>
          <span>Escape {video.networkEscape.toFixed(video.networkEscape >= 10 ? 0 : 1)}x</span>
          <span>Breakout {video.breakoutStrength}</span>
          <span>Força viral {video.viralForce}</span>
        </div>
      </div>
      <div className="scoreBadge">
        <span>HYPE</span>
        <strong>{video.hypeScore}</strong>
      </div>
    </a>
  );
}

function MacroPanel({ radar }: { radar: MacroRadar }) {
  return (
    <article className="panel">
      <div className="panelHeader">
        <div>
          <p className="sectionKicker">{radar.label.toUpperCase()}</p>
          <h3>Vídeos em alta · últimas {radar.windowHours}h</h3>
        </div>
        <span className="panelHint">{radar.channelCount} canais · {radar.videoCount} vídeos elegíveis</span>
      </div>
      {radar.error ? (
        <p className="emptyState">Não foi possível atualizar este universo agora.</p>
      ) : (
        <div className="videoList">
          {radar.videos.slice(0, 5).map((video, index) => (
            <VideoRow key={video.id} video={video} rank={index + 1} />
          ))}
          {!radar.videos.length ? <p className="emptyState">Sem vídeos elegíveis nesta janela.</p> : null}
        </div>
      )}
    </article>
  );
}

export default async function Home() {
  const popularity = await getCurrentPopularity();
  const politica = popularity.macroRadars.find((radar) => radar.key === 'politica');
  const economia = popularity.macroRadars.find((radar) => radar.key === 'economia');
  const entretenimento = popularity.macroRadars.find((radar) => radar.key === 'entretenimento');
  const radars = [politica, economia, entretenimento].filter((radar): radar is MacroRadar => Boolean(radar));
  const totalMacroVideos = radars.reduce((sum, radar) => sum + radar.videoCount, 0);
  const totalMacroChannels = new Set(radars.flatMap((radar) => radar.videos.map((video) => video.channelId))).size;
  const strongestRadar = [...radars].sort((a, b) => b.totalViewsPerHour - a.totalViewsPerHour)[0];
  const diffusionSignals = radars
    .flatMap((radar) => radar.diffusionSignals.map((signal) => ({ ...signal, categoryLabel: radar.label })))
    .sort((a, b) => b.opportunityScore - a.opportunityScore || b.peripheralBreakout - a.peripheralBreakout);

  return (
    <main className="dashboardPage">
      <header className="topbar">
        <div>
          <p className="brandEyebrow">YouTube Intelligence Brasil</p>
          <h1>YT Intelligence BR</h1>
        </div>
        <div className="liveStatus">
          <span className={popularity.ok ? 'statusDot isLive' : 'statusDot'} />
          <div>
            <strong>{popularity.ok ? 'Radar macro ativo' : 'Radar indisponível'}</strong>
            <span>Brasil · atualizado {formatUpdatedAt(popularity.generatedAt)}</span>
          </div>
        </div>
      </header>

      <section className="heroSection">
        <div>
          <p className="sectionKicker">DESCOBERTA MACRO</p>
          <h2>Primeiro descobrir quais vídeos estão em alta dentro de cada grande assunto.</h2>
          <p className="sectionIntro">
            Política, Economia e Entretenimento são observados separadamente. O ranking agora considera a topologia da
            rede: um vídeo que rompe o alcance esperado de um canal periférico recebe um sinal diferente de um vídeo que
            nasce dentro de um hub com grande distribuição inicial.
          </p>
        </div>
        <div className="filterBadge">Long-form · Brasil · ≥8 min</div>
      </section>

      <section className="statGrid" aria-label="Resumo macro">
        <article className="statCard accentCard">
          <span>Política · líder atual</span>
          <strong className="topicHeroValue">{politica?.videos[0]?.channelTitle ?? '—'}</strong>
          <p>{politica?.videos[0] ? `${compactNumber.format(politica.videos[0].views)} views · Hype ${politica.videos[0].hypeScore} · Escape ${politica.videos[0].networkEscape.toFixed(1)}x` : 'Sem leitura disponível'}</p>
        </article>
        <article className="statCard momentumCard">
          <span>Economia · líder atual</span>
          <strong className="topicHeroValue">{economia?.videos[0]?.channelTitle ?? '—'}</strong>
          <p>{economia?.videos[0] ? `${compactNumber.format(economia.videos[0].views)} views · Hype ${economia.videos[0].hypeScore} · Escape ${economia.videos[0].networkEscape.toFixed(1)}x` : 'Sem leitura disponível'}</p>
        </article>
        <article className="statCard">
          <span>Entretenimento · líder atual</span>
          <strong className="topicHeroValue">{entretenimento?.videos[0]?.channelTitle ?? '—'}</strong>
          <p>{entretenimento?.videos[0] ? `${compactNumber.format(entretenimento.videos[0].views)} views · Hype ${entretenimento.videos[0].hypeScore} · Escape ${entretenimento.videos[0].networkEscape.toFixed(1)}x` : 'Sem leitura disponível'}</p>
        </article>
        <article className="statCard">
          <span>Universo macro observado</span>
          <strong>{totalMacroVideos}</strong>
          <p>{totalMacroChannels} canais únicos · maior velocidade agregada: {strongestRadar?.label ?? '—'}</p>
        </article>
      </section>

      {!popularity.ok ? (
        <section className="errorPanel">
          <strong>Não foi possível consultar o YouTube agora.</strong>
          <span>{popularity.error ?? 'Verifique YOUTUBE_API_KEY e a cota da YouTube Data API v3.'}</span>
        </section>
      ) : null}

      <section className="topicSection">
        <div className="topicSectionHeader">
          <div>
            <p className="sectionKicker">RANKING MACRO POR ASSUNTO</p>
            <h3>Os vídeos que estão ganhando atenção dentro de cada universo</h3>
          </div>
          <span>janela de descoberta: 72h · cache de busca: 3h</span>
        </div>

        <div className="radarGrid">
          {radars.map((radar) => <MacroPanel key={radar.key} radar={radar} />)}
        </div>

        <p className="methodNote">
          O Hype usa o modelo {popularity.networkModelVersion}. O alcance esperado é estimado dentro do próprio cohort
          por tamanho do canal e idade do vídeo; o Network Escape mede o quanto a performance observada rompe essa
          expectativa. Quando houver histórico suficiente do mesmo canal no Neon, a linha de base histórica substituirá
          progressivamente o prior cross-sectional. Views/h continua sendo um proxy acumulado até termos deltas temporais.
        </p>
      </section>

      <section className="futureSection">
        <div className="futureHeading">
          <div>
            <p className="sectionKicker futureKicker">DIFUSÃO EM REDE</p>
            <h2>Encontrar assuntos que rompem a periferia antes de saturarem os hubs</h2>
          </div>
          <span>Peripheral Breakout · Hub Penetration</span>
        </div>
        <div className="futureGrid">
          {diffusionSignals.slice(0, 3).map((signal, index) => (
            <article key={`${signal.categoryLabel}-${signal.topicKey}`}>
              <span>{(index + 1).toString().padStart(2, '0')}</span>
              <strong>{signal.topicLabel}</strong>
              <p>
                {signal.categoryLabel} · {signal.stage} · oportunidade {signal.opportunityScore} · breakout periférico {signal.peripheralBreakout} · hubs {signal.hubPenetration}%
              </p>
            </article>
          ))}
          {!diffusionSignals.length ? (
            <article>
              <span>—</span>
              <strong>Coletando sinais</strong>
              <p>A difusão aparece quando há vídeos suficientes em diferentes tiers de canais.</p>
            </article>
          ) : null}
        </div>
        <p className="methodNote">
          O estágio de difusão ainda é um proxy cross-sectional: ele compara breakout de nós periféricos e médios com a
          penetração em canais grandes e hubs no mesmo recorte. O histórico persistido permitirá medir a passagem real
          PERIFERIA → MÉDIOS → GRANDES → HUBS ao longo do tempo.
        </p>
      </section>

      <section className="growthPanel">
        <div>
          <p className="sectionKicker">SEGUNDA CAMADA · DEPOIS DA DESCOBERTA</p>
          <h3>O aprofundamento só começa depois que o vídeo vencedor é identificado</h3>
          <p>
            Para os vídeos que aparecem no topo do ranking macro, a etapa seguinte poderá analisar desempenho relativo
            ao canal, likes, comentários, título, thumbnail, timing, subtema e lacunas de audiência. Watchlists como
            MBL / Partido Missão / Livro Amarelo / Renan Santos entram aqui, como recortes específicos dentro de Política,
            e não como substitutos do radar macro.
          </p>
        </div>
        <div className="baselineMeter">
          <span>Ordem do sistema</span>
          <strong>MACRO → REDE → SELEÇÃO → ANÁLISE</strong>
          <small>descobrir primeiro · medir propagação · explicar depois</small>
        </div>
      </section>

      <section className="futureSection">
        <div className="futureHeading">
          <div>
            <p className="sectionKicker futureKicker">HISTÓRICO PRÓPRIO</p>
            <h2>Transformar ranking atual em tendência e aceleração reais</h2>
          </div>
          <span>Neon/Postgres · snapshots temporais</span>
        </div>
        <div className="futureGrid">
          <article>
            <span>01</span>
            <strong>Node baseline</strong>
            <p>Aprender a distribuição normal de cada canal por idade do vídeo, em vez de depender apenas de inscritos.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Network Escape</strong>
            <p>Registrar quando um vídeo ultrapassa progressivamente a audiência natural do nó que o publicou.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Propagação</strong>
            <p>Observar temas saindo de canais periféricos, chegando aos médios e finalmente penetrando os grandes hubs.</p>
          </article>
        </div>
      </section>

      <footer className="footerNote">
        <span>Fonte: YouTube Data API v3</span>
        <span>Modelo: {popularity.networkModelVersion}</span>
        <span>Universos: Politics · Business · Entertainment</span>
        <span>Região: Brasil</span>
        <span>Janela macro: 72 horas</span>
      </footer>
    </main>
  );
}
