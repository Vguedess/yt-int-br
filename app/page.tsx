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
            Política, Economia e Entretenimento são observados separadamente. O objetivo desta camada não é explicar
            ainda por que um vídeo venceu, mas identificar corretamente os vídeos que merecem uma investigação mais
            profunda. O Hype Score é relativo ao próprio universo temático, evitando comparar política com games,
            música ou entretenimento.
          </p>
        </div>
        <div className="filterBadge">Long-form · Brasil · ≥8 min</div>
      </section>

      <section className="statGrid" aria-label="Resumo macro">
        <article className="statCard accentCard">
          <span>Política · líder atual</span>
          <strong className="topicHeroValue">{politica?.videos[0]?.channelTitle ?? '—'}</strong>
          <p>{politica?.videos[0] ? `${compactNumber.format(politica.videos[0].views)} views · Hype ${politica.videos[0].hypeScore}` : 'Sem leitura disponível'}</p>
        </article>
        <article className="statCard momentumCard">
          <span>Economia · líder atual</span>
          <strong className="topicHeroValue">{economia?.videos[0]?.channelTitle ?? '—'}</strong>
          <p>{economia?.videos[0] ? `${compactNumber.format(economia.videos[0].views)} views · Hype ${economia.videos[0].hypeScore}` : 'Sem leitura disponível'}</p>
        </article>
        <article className="statCard">
          <span>Entretenimento · líder atual</span>
          <strong className="topicHeroValue">{entretenimento?.videos[0]?.channelTitle ?? '—'}</strong>
          <p>{entretenimento?.videos[0] ? `${compactNumber.format(entretenimento.videos[0].views)} views · Hype ${entretenimento.videos[0].hypeScore}` : 'Sem leitura disponível'}</p>
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
          O ranking começa com até 50 candidatos recentes associados ao tópico oficial do YouTube para cada universo.
          Depois do filtro global, o Hype Score é calculado apenas entre os vídeos daquele universo usando velocidade de
          views, engajamento e recência. Views/h ainda é uma aproximação baseada em views acumuladas e idade do vídeo;
          com snapshots no Neon ela será substituída por velocidade temporal observada.
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
          <strong>MACRO → SELEÇÃO → ANÁLISE</strong>
          <small>descobrir primeiro · explicar depois</small>
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
            <strong>Descoberta</strong>
            <p>Encontrar os vídeos líderes em Política, Economia e Entretenimento sem misturar universos.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Histórico</strong>
            <p>Registrar views, likes e comentários dos candidatos ao longo do tempo no nosso próprio banco.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Aceleração</strong>
            <p>Medir quais vídeos e subtemas estão acelerando de verdade, e não apenas acumulando views.</p>
          </article>
        </div>
      </section>

      <footer className="footerNote">
        <span>Fonte: YouTube Data API v3</span>
        <span>Universos: Politics · Business · Entertainment</span>
        <span>Região: Brasil</span>
        <span>Janela macro: 72 horas</span>
      </footer>
    </main>
  );
}
