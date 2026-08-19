import Image from 'next/image';
import { getCurrentPopularity, type PopularVideo } from '@/lib/youtube-popularity';

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

export default async function Home() {
  const popularity = await getCurrentPopularity();
  const topHype = popularity.mostPopular[0];
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
          <h2>O que está capturando atenção neste momento</h2>
          <p className="sectionIntro">
            Sinais atuais do YouTube Brasil após o filtro editorial global. Música, conteúdo infantil,
            canais religiosos, conteúdo voltado a pré-adolescentes, lives e vídeos com menos de 8 minutos
            não entram na análise.
          </p>
        </div>
        <div className="filterBadge">Filtro global · v2026.08.19</div>
      </section>

      <section className="statGrid" aria-label="Resumo do radar atual">
        <article className="statCard accentCard">
          <span>Maior hype agora</span>
          <strong>{topHype ? topHype.hypeScore : '—'}</strong>
          <p>{topHype?.title ?? 'Aguardando dados elegíveis da API'}</p>
        </article>
        <article className="statCard">
          <span>Mais visto · publicado em 24h</span>
          <strong>{top24h ? compactNumber.format(top24h.views) : '—'}</strong>
          <p>{top24h?.title ?? 'Aguardando dados elegíveis da API'}</p>
        </article>
        <article className="statCard">
          <span>Conteúdo descartado pelo filtro</span>
          <strong>{popularity.excludedCount}</strong>
          <p>Itens removidos antes de qualquer ranking ou análise desta atualização.</p>
        </article>
        <article className="statCard mutedCard">
          <span>Maior ganho de inscritos · 24h</span>
          <strong>Baseline</strong>
          <p>Será calculado por diferença entre snapshots diários dos canais monitorados.</p>
        </article>
      </section>

      {!popularity.ok ? (
        <section className="errorPanel">
          <strong>Não foi possível consultar o YouTube agora.</strong>
          <span>{popularity.error ?? 'Verifique YOUTUBE_API_KEY e a cota da YouTube Data API v3.'}</span>
        </section>
      ) : null}

      <section className="radarGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="sectionKicker">HYPE AGORA</p>
              <h3>Popularidade com velocidade</h3>
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
              <p className="sectionKicker">ÚLTIMAS 24H</p>
              <h3>Mais vistos entre os recém-publicados</h3>
            </div>
            <span className="panelHint">publicados nas últimas 24 horas</span>
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
          <p className="sectionKicker">CANAIS · MOMENTUM</p>
          <h3>Ganho real de inscritos em 24h</h3>
          <p>
            O YouTube expõe a contagem pública atual, não o delta histórico de inscritos de outros canais.
            O sistema vai calcular esse indicador com snapshots próprios e exibirá o ranking assim que houver
            duas observações comparáveis separadas por aproximadamente 24 horas.
          </p>
        </div>
        <div className="baselineMeter">
          <span>Estado</span>
          <strong>BASELINE EM COLETA</strong>
          <small>sem estimativas inventadas</small>
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
      </footer>
    </main>
  );
}
