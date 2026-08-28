import Image from 'next/image';
import { getCurrentPopularity, type PopularVideo } from '@/lib/youtube-popularity';
import type { TopicPulse, TopicRepresentative } from '@/lib/topic-intelligence';

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
  return `${Math.round(value * 100)}%`;
}

function signedCompact(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${compactNumber.format(value)}`;
}

function VideoRow({
  video,
  rank,
  mode,
  topicLabel,
  collapsedCount = 0
}: {
  video: PopularVideo;
  rank: number;
  mode: 'hype' | 'views';
  topicLabel?: string;
  collapsedCount?: number;
}) {
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
          {topicLabel ? <span>Tema: {topicLabel}</span> : null}
          <span>{compactNumber.format(video.views)} views</span>
          <span>{formatDuration(video.durationSeconds)}</span>
          {mode === 'hype'
            ? <span>{compactNumber.format(Math.round(video.viewsPerHour))} views/h</span>
            : <span>{video.ageHours.toFixed(video.ageHours < 10 ? 1 : 0)}h no ar</span>}
          {collapsedCount > 0 ? <span>+{collapsedCount} semelhantes consolidados</span> : null}
        </div>
      </div>
      <div className={mode === 'hype' ? 'scoreBadge' : 'viewsBadge'}>
        <span>{mode === 'hype' ? 'HYPE' : 'VIEWS'}</span>
        <strong>{mode === 'hype' ? video.hypeScore : compactNumber.format(video.views)}</strong>
      </div>
    </a>
  );
}

function RepresentativeRow({ item, rank, mode }: { item: TopicRepresentative; rank: number; mode: 'hype' | 'views' }) {
  return <VideoRow video={item.video} rank={rank} mode={mode} topicLabel={item.topicLabel} collapsedCount={item.collapsedCount} />;
}

function TopicRow({ topic, rank, mode }: { topic: TopicPulse; rank: number; mode: 'dominance' | 'momentum' }) {
  const score = mode === 'dominance' ? topic.dominanceScore : topic.momentumScore;
  return (
    <article className="topicRow">
      <span className="topicRank">{rank.toString().padStart(2, '0')}</span>
      <div className="topicMain">
        <div className="topicTitleLine">
          <strong>{topic.label}</strong>
          <span className={`stagePill stage-${topic.stage.toLowerCase().replace('ç', 'c').replace('ã', 'a')}`}>{topic.stage}</span>
        </div>
        <div className="topicMeta">
          <span>{topic.videoCount} vídeos</span>
          <span>{topic.channelCount} canais</span>
          <span>{compactNumber.format(Math.round(topic.totalViewsPerHour))} views/h</span>
          <span>{formatPercent(topic.shareOfRadarViews)} das views do radar</span>
        </div>
        <div className="topicBar" aria-hidden="true"><span style={{ width: `${score}%` }} /></div>
      </div>
      <div className="topicScore">
        <span>{mode === 'dominance' ? 'DOMÍNIO' : 'MOMENTUM'}</span>
        <strong>{score}</strong>
      </div>
    </article>
  );
}

export default async function Home() {
  const popularity = await getCurrentPopularity();
  const dominantTopic = popularity.topics[0];
  const acceleratingTopic = popularity.acceleratingTopics[0];
  const homogeneity = popularity.homogeneity;
  const channelGrowth = popularity.channelGrowth24h;

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
            <strong>{popularity.ok ? 'Radar atual ativo' : 'Radar indisponível'}</strong>
            <span>Brasil · atualizado {formatUpdatedAt(popularity.generatedAt)}</span>
          </div>
        </div>
      </header>

      <section className="heroSection">
        <div>
          <p className="sectionKicker">AGORA</p>
          <h2>Quais temas estão dominando — e quanto o ranking está repetindo a mesma narrativa</h2>
          <p className="sectionIntro">
            O radar agrupa vídeos por núcleo temático. Reacts, análises, segredos e explicações sobre o mesmo assunto
            são tratados como conteúdo altamente semelhante. O histórico de crescimento de canais passa a ser
            complementado pela Social Blade e persistido no Neon.
          </p>
        </div>
        <div className="filterBadge">Filtro global · v2026.08.19.2</div>
      </section>

      <section className="statGrid" aria-label="Resumo do radar atual">
        <article className="statCard accentCard">
          <span>Tema dominante agora</span>
          <strong className="topicHeroValue">{dominantTopic?.label ?? '—'}</strong>
          <p>{dominantTopic ? `${dominantTopic.videoCount} vídeos · ${compactNumber.format(Math.round(dominantTopic.totalViewsPerHour))} views/h agregadas` : 'Aguardando dados elegíveis da API'}</p>
        </article>
        <article className="statCard momentumCard">
          <span>Maior rota de crescimento</span>
          <strong className="topicHeroValue">{acceleratingTopic?.label ?? '—'}</strong>
          <p>{acceleratingTopic ? `Momentum ${acceleratingTopic.momentumScore}/100 · ${acceleratingTopic.channelCount} canais no sinal` : 'Sem tema com sinal multicanal suficiente nesta leitura'}</p>
        </article>
        <article className="statCard">
          <span>Homogeneidade do ranking</span>
          <strong>{homogeneity.index}</strong>
          <p>{homogeneity.interpretation} · {formatPercent(homogeneity.dominantTopicVideoShare)} dos vídeos no maior cluster{homogeneity.dominantTopicLabel ? ` (${homogeneity.dominantTopicLabel})` : ''}.</p>
        </article>
        <article className="statCard">
          <span>Maior ganho de inscritos · 24h</span>
          <strong>{channelGrowth ? signedCompact(channelGrowth.subscribersGain24h) : '—'}</strong>
          <p>
            {channelGrowth
              ? `${channelGrowth.channelTitle} · Social Blade${channelGrowth.viewsGain24h != null ? ` · ${signedCompact(channelGrowth.viewsGain24h)} views` : ''}`
              : popularity.channelGrowthStatus === 'socialblade-not-configured'
                ? 'Aguardando credenciais da Social Blade Business API'
                : 'Social Blade configurada; aguardando a primeira sincronização histórica'}
          </p>
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
          <div><p className="sectionKicker">MAPA DE TEMAS</p><h3>Da popularidade de vídeos para a força das narrativas</h3></div>
          <span>agregação temática · vídeos elegíveis do radar atual</span>
        </div>
        <div className="topicGrid">
          <article className="topicPanel">
            <div className="topicPanelHeader"><div><p className="sectionKicker">DOMINÂNCIA</p><h4>Principais temas agora</h4></div><span>alcance + velocidade + participação</span></div>
            <div className="topicList">{popularity.topics.slice(0, 5).map((topic, index) => <TopicRow key={topic.key} topic={topic} rank={index + 1} mode="dominance" />)}</div>
          </article>
          <article className="topicPanel accelerationPanel">
            <div className="topicPanelHeader"><div><p className="sectionKicker accelerationKicker">ACELERAÇÃO</p><h4>Temas em rota de crescimento</h4></div><span>proxy: velocidade + recência + repetição multicanal</span></div>
            <div className="topicList">
              {popularity.acceleratingTopics.length
                ? popularity.acceleratingTopics.slice(0, 5).map((topic, index) => <TopicRow key={topic.key} topic={topic} rank={index + 1} mode="momentum" />)
                : <p className="emptyState">Nenhum tema atingiu o limiar multicanal de aceleração nesta leitura.</p>}
            </div>
          </article>
        </div>
        <p className="methodNote">
          Homogeneidade: média das similaridades temáticas entre todos os pares de vídeos, transformada por uma curva sigmoidal normalizada. A curva dá mais peso ao início da concentração e reduz o ganho marginal quando a repetição já está acima da média.
        </p>
      </section>

      <section className="radarGrid">
        <article className="panel">
          <div className="panelHeader"><div><p className="sectionKicker">HYPE · POR TEMA</p><h3>Um representante por narrativa</h3></div><span className="panelHint">duplicatas temáticas consolidadas</span></div>
          <div className="videoList">
            {popularity.mostPopularByTopic.slice(0, 6).map((item, index) => <RepresentativeRow key={item.topicKey} item={item} rank={index + 1} mode="hype" />)}
            {!popularity.mostPopularByTopic.length ? <p className="emptyState">Sem temas elegíveis nesta leitura.</p> : null}
          </div>
        </article>
        <article className="panel">
          <div className="panelHeader"><div><p className="sectionKicker">≤24H · POR TEMA</p><h3>Mais vistos sem repetir o mesmo assunto</h3></div><span className="panelHint">1 vídeo representativo por tema</span></div>
          <div className="videoList">
            {popularity.publishedLast24hByTopic.slice(0, 6).map((item, index) => <RepresentativeRow key={item.topicKey} item={item} rank={index + 1} mode="views" />)}
            {!popularity.publishedLast24hByTopic.length ? <p className="emptyState">Sem temas elegíveis nesta leitura.</p> : null}
          </div>
        </article>
      </section>

      <section className="growthPanel">
        <div>
          <p className="sectionKicker">HISTÓRICO DE CANAIS</p>
          <h3>YouTube para o presente; Social Blade para a trajetória</h3>
          <p>
            O ranking de vídeos continua vindo da YouTube Data API. A Social Blade entra como camada histórica para
            crescimento diário de inscritos e views dos canais observados. Os pontos retornados pela API são copiados
            para o Neon para análise temporal e comparação com nossos próprios snapshots.
          </p>
        </div>
        <div className="baselineMeter">
          <span>Social Blade</span>
          <strong>{channelGrowth ? 'HISTÓRICO ATIVO' : popularity.channelGrowthStatus === 'socialblade-not-configured' ? 'AGUARDANDO API' : 'AGUARDANDO SYNC'}</strong>
          <small>fonte complementar de estatísticas públicas</small>
        </div>
      </section>

      <section className="futureSection">
        <div className="futureHeading"><div><p className="sectionKicker futureKicker">PRÉ-HYPE · PRÓXIMA CAMADA</p><h2>Posicionar antes da atenção chegar ao pico</h2></div><span>estrutura reservada · sem dados simulados</span></div>
        <div className="futureGrid">
          <article><span>01</span><strong>Narrativas emergentes</strong><p>Assuntos ainda pequenos, mas com aceleração consistente em fontes externas e YouTube.</p></article>
          <article><span>02</span><strong>Vantagem de propagação</strong><p>Estimativa de quanto tempo um sinal externo pode levar para atingir o YouTube Brasil.</p></article>
          <article><span>03</span><strong>Opportunity forecast</strong><p>Demanda prevista no momento da publicação versus oferta esperada e saturação competitiva.</p></article>
        </div>
      </section>

      <footer className="footerNote">
        <span>Vídeos: YouTube Data API v3</span>
        <span>Histórico de canais: <a href="https://socialblade.com" target="_blank" rel="noreferrer">Social Blade</a></span>
        <span>Região: Brasil</span>
        <span>Cache de coleta: 1 hora</span>
      </footer>
    </main>
  );
}
