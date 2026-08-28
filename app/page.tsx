import Image from 'next/image';
import { getCurrentPopularity, type PopularVideo } from '@/lib/youtube-popularity';
import type { TopicPulse } from '@/lib/topic-intelligence';

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

function VideoRow({ video, rank, mode }: { video: PopularVideo; rank: number; mode: 'hype' | 'views' }) {
  return (
    <a
      className="videoRow"
      href={`https://www.youtube.com/watch?v=${video.id}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className="rank">{rank.toString().padStart(2, '0')}</span>
      <div className="thumbWrap">
        {video.thumbnailUrl ? (
          <Image
            className="thumbnail"
            src={video.thumbnailUrl}
            alt=""
            width={240}
            height={135}
            sizes="120px"
          />
        ) : (
          <div className="thumbnailFallback" />
        )}
      </div>
      <div className="videoCopy">
        <strong>{video.title}</strong>
        <span>{video.channelTitle}</span>
        <div className="videoMeta">
          <span>{compactNumber.format(video.views)} views</span>
          <span>{formatDuration(video.durationSeconds)}</span>
          {mode === 'hype' ? (
            <span>{compactNumber.format(Math.round(video.viewsPerHour))} views/h</span>
          ) : (
            <span>{video.ageHours.toFixed(video.ageHours < 10 ? 1 : 0)}h no ar</span>
          )}
        </div>
      </div>
      <div className={mode === 'hype' ? 'scoreBadge' : 'viewsBadge'}>
        <span>{mode === 'hype' ? 'HYPE' : 'VIEWS'}</span>
        <strong>{mode === 'hype' ? video.hypeScore : compactNumber.format(video.views)}</strong>
      </div>
    </a>
  );
}

function TopicRow({ topic, rank, mode }: { topic: TopicPulse; rank: number; mode: 'dominance' | 'momentum' }) {
  const score = mode === 'dominance' ? topic.dominanceScore : topic.momentumScore;
  return (
    <article className="topicRow">
      <span className="topicRank">{rank.toString().padStart(2, '0')}</span>
      <div className="topicMain">
        <div className="topicTitleLine">
          <strong>{topic.label}</strong>
          <span className={`stagePill stage-${topic.stage.toLowerCase().replace('ç', 'c').replace('ã', 'a')}`}>
            {topic.stage}
          </span>
        </div>
        <div className="topicMeta">
          <span>{topic.videoCount} vídeos</span>
          <span>{topic.channelCount} canais</span>
          <span>{compactNumber.format(Math.round(topic.totalViewsPerHour))} views/h</span>
          <span>{formatPercent(topic.shareOfRadarViews)} das views do radar</span>
        </div>
        <div className="topicBar" aria-hidden="true">
          <span style={{ width: `${score}%` }} />
        </div>
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
  const top24h = popularity.publishedLast24h[0];

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
          <h2>Quais temas estão dominando — e quais estão acelerando</h2>
          <p className="sectionIntro">
            O radar agora agrupa os principais vídeos em temas para distinguir um vídeo isolado de uma narrativa
            que está ganhando força em múltiplos canais. O estágio de aceleração ainda é um proxy de momentum
            atual; será substituído por aceleração temporal real conforme o Neon acumular snapshots.
          </p>
        </div>
        <div className="filterBadge">Filtro global · v2026.08.19.2</div>
      </section>

      <section className="statGrid" aria-label="Resumo do radar atual">
        <article className="statCard accentCard">
          <span>Tema dominante agora</span>
          <strong className="topicHeroValue">{dominantTopic?.label ?? '—'}</strong>
          <p>
            {dominantTopic
              ? `${dominantTopic.videoCount} vídeos · ${compactNumber.format(Math.round(dominantTopic.totalViewsPerHour))} views/h agregadas`
              : 'Aguardando dados elegíveis da API'}
          </p>
        </article>
        <article className="statCard momentumCard">
          <span>Maior rota de crescimento</span>
          <strong className="topicHeroValue">{acceleratingTopic?.label ?? '—'}</strong>
          <p>
            {acceleratingTopic
              ? `Momentum ${acceleratingTopic.momentumScore}/100 · ${acceleratingTopic.channelCount} canais no sinal`
              : 'Sem tema com sinal multicanal suficiente nesta leitura'}
          </p>
        </article>
        <article className="statCard">
          <span>Mais visto · publicado há ≤24h</span>
          <strong>{top24h ? compactNumber.format(top24h.views) : '—'}</strong>
          <p>{top24h?.title ?? 'Aguardando dados elegíveis da API'}</p>
        </article>
        <article className="statCard mutedCard">
          <span>Histórico temporal</span>
          <strong>Neon</strong>
          <p>Postgres conectado. A série temporal começa a transformar momentum em aceleração observada.</p>
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
            <p className="sectionKicker">MAPA DE TEMAS</p>
            <h3>Da popularidade de vídeos para a força das narrativas</h3>
          </div>
          <span>agregação temática · vídeos elegíveis do radar atual</span>
        </div>

        <div className="topicGrid">
          <article className="topicPanel">
            <div className="topicPanelHeader">
              <div>
                <p className="sectionKicker">DOMINÂNCIA</p>
                <h4>Principais temas agora</h4>
              </div>
              <span>alcance + velocidade + participação</span>
            </div>
            <div className="topicList">
              {popularity.topics.slice(0, 5).map((topic, index) => (
                <TopicRow key={topic.key} topic={topic} rank={index + 1} mode="dominance" />
              ))}
            </div>
          </article>

          <article className="topicPanel accelerationPanel">
            <div className="topicPanelHeader">
              <div>
                <p className="sectionKicker accelerationKicker">ACELERAÇÃO</p>
                <h4>Temas em rota de crescimento</h4>
              </div>
              <span>proxy: velocidade + recência + repetição multicanal</span>
            </div>
            <div className="topicList">
              {popularity.acceleratingTopics.length ? popularity.acceleratingTopics.slice(0, 5).map((topic, index) => (
                <TopicRow key={topic.key} topic={topic} rank={index + 1} mode="momentum" />
              )) : <p className="emptyState">Nenhum tema atingiu o limiar multicanal de aceleração nesta leitura.</p>}
            </div>
          </article>
        </div>

        <p className="methodNote">
          “Aceleração” ainda não significa d²views/dt² observado. Nesta fase, o sistema usa um proxy de momentum.
          Com snapshots suficientes no Neon, essa classificação passará a considerar velocidade e aceleração reais
          do tema ao longo do tempo.
        </p>
      </section>

      <section className="radarGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="sectionKicker">HYPE AGORA</p>
              <h3>Vídeos que alimentam os temas</h3>
            </div>
            <span className="panelHint">YouTube mostPopular + score interno</span>
          </div>
          <div className="videoList">
            {popularity.mostPopular.slice(0, 6).map((video, index) => (
              <VideoRow key={video.id} video={video} rank={index + 1} mode="hype" />
            ))}
            {!popularity.mostPopular.length ? <p className="emptyState">Sem itens elegíveis nesta leitura.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="sectionKicker">PUBLICADOS HÁ ≤24H</p>
              <h3>Mais vistos entre os recém-publicados</h3>
            </div>
            <span className="panelHint">total atual de views · não é delta de 24h</span>
          </div>
          <div className="videoList">
            {popularity.publishedLast24h.slice(0, 6).map((video, index) => (
              <VideoRow key={video.id} video={video} rank={index + 1} mode="views" />
            ))}
            {!popularity.publishedLast24h.length ? <p className="emptyState">Sem itens elegíveis nesta leitura.</p> : null}
          </div>
        </article>
      </section>

      <section className="growthPanel">
        <div>
          <p className="sectionKicker">PRÓXIMA MEDIDA</p>
          <h3>Aceleração observada, não apenas momentum</h3>
          <p>
            O Neon já está conectado. O próximo passo é persistir snapshots de vídeos, canais e temas em intervalos
            regulares. Com isso, o sistema poderá distinguir crescimento linear de aceleração real e detectar a
            passagem entre emergência, pré-tendência, aceleração, pico e saturação.
          </p>
        </div>
        <div className="baselineMeter">
          <span>Estado</span>
          <strong>BASELINE TEMPORAL</strong>
          <small>infraestrutura conectada</small>
        </div>
      </section>

      <section className="futureSection">
        <div className="futureHeading">
          <div>
            <p className="sectionKicker futureKicker">PRÉ-HYPE · PRÓXIMA CAMADA</p>
            <h2>Posicionar antes da atenção chegar ao pico</h2>
          </div>
          <span>estrutura reservada · sem dados simulados</span>
        </div>
        <div className="futureGrid">
          <article>
            <span>01</span>
            <strong>Narrativas emergentes</strong>
            <p>Assuntos ainda pequenos, mas com aceleração consistente em fontes externas e YouTube.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Vantagem de propagação</strong>
            <p>Estimativa de quanto tempo um sinal externo pode levar para atingir o YouTube Brasil.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Opportunity forecast</strong>
            <p>Demanda prevista no momento da publicação versus oferta esperada e saturação competitiva.</p>
          </article>
        </div>
      </section>

      <footer className="footerNote">
        <span>Fonte atual: YouTube Data API v3</span>
        <span>Região: Brasil</span>
        <span>Cache de coleta: 1 hora</span>
        <span>Aceleração atual: proxy de momentum</span>
      </footer>
    </main>
  );
}
