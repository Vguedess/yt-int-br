import Image from 'next/image';
import { LeaderRefreshButton } from '@/app/components/LeaderRefreshButton';
import styles from '@/app/leaders.module.css';
import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
import { getHypeDashboard, type HypeVideoCard } from '@/lib/youtube-hype-service';
import type { CategoryLeader, LeaderCategoryKey } from '@/lib/youtube-category-leaders';

export const dynamic = 'force-dynamic';

const CATEGORY_ORDER: LeaderCategoryKey[] = [
  'news-politics',
  'science-tech',
  'economia',
  'entretenimento'
];

const compactNumber = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1
});

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes} min`;
}

function LeaderCard({ leader }: { leader: CategoryLeader }) {
  return (
    <article className={styles.card}>
      <a className={styles.cardLink} href={`https://www.youtube.com/watch?v=${leader.videoId}`} target="_blank" rel="noreferrer">
        <div className={styles.imageWrap}>
          {leader.thumbnailUrl ? (
            <Image className={styles.image} src={leader.thumbnailUrl} alt={`Thumbnail de ${leader.title}`} width={960} height={540}
              sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw" priority />
          ) : <div className={styles.imageFallback}>Sem thumbnail</div>}
          <span className={styles.category}>{leader.categoryLabel}</span>
        </div>
        <div className={styles.cardBody}>
          <h3>{leader.title}</h3>
          <dl className={styles.details}>
            <div><dt>Canal</dt><dd>{leader.channelTitle}</dd></div>
            <div><dt>Inscritos</dt><dd>{leader.subscribers == null ? '—' : compactNumber.format(leader.subscribers)}</dd></div>
            <div><dt>Duração</dt><dd>{formatDuration(leader.durationSeconds)}</dd></div>
            <div><dt>Views</dt><dd>{compactNumber.format(leader.views)}</dd></div>
          </dl>
          <div className={styles.cardFooter}>
            <span>Publicado {formatDateTime(leader.publishedAt)}</span>
            <span>Mercado YouTube BR · {leader.candidateCount} candidatos</span>
          </div>
        </div>
      </a>
    </article>
  );
}

function HypeCard({ video }: { video: HypeVideoCard }) {
  const isManualYouTubeHype = video.sourceKind === 'youtube-hype-manual';
  return (
    <article className={`${styles.card} ${styles.hypeCard}`}>
      <a className={styles.cardLink} href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">
        <div className={styles.imageWrap}>
          <Image className={styles.image} src={video.thumbnailUrl} alt={`Thumbnail de ${video.title}`} width={960} height={540}
            sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw" />
          <span className={styles.hypeRank}>HYPE #{video.rank}</span>
          {!isManualYouTubeHype && video.hypeScore != null ? <span className={styles.hypeScore}>Score {video.hypeScore}</span> : null}
        </div>
        <div className={styles.cardBody}>
          <h3>{video.title}</h3>
          <dl className={styles.details}>
            <div><dt>Canal</dt><dd>{video.channelTitle}</dd></div>
            <div><dt>Inscritos</dt><dd>{video.subscribers == null ? '—' : compactNumber.format(video.subscribers)}</dd></div>
            <div><dt>Duração</dt><dd>{formatDuration(video.durationSeconds)}</dd></div>
            <div><dt>Views</dt><dd>{video.currentViews ? compactNumber.format(video.currentViews) : '—'}</dd></div>
            {!isManualYouTubeHype && video.networkEscape != null ? <div><dt>Network Escape</dt><dd>{video.networkEscape.toFixed(1)}×</dd></div> : null}
            {!isManualYouTubeHype && video.breakoutStrength != null ? <div><dt>Breakout</dt><dd>{video.breakoutStrength}/100</dd></div> : null}
          </dl>
          <div className={styles.cardFooter}>
            {isManualYouTubeHype ? (
              <>
                <span>Ranking Hype do YouTube Brasil · filtros editoriais aplicados</span>
                <span>Registrado {formatDateTime(video.observedHour)}</span>
              </>
            ) : (
              <>
                <span>Força viral {video.viralForce ?? '—'}/100 · nó {video.nodeTier ?? '—'}</span>
                <span>Snapshot {formatDateTime(video.observedHour)}</span>
              </>
            )}
          </div>
        </div>
      </a>
    </article>
  );
}

export default async function Home() {
  try {
    const [dashboard, hype] = await Promise.all([getLeaderDashboard(), getHypeDashboard()]);
    const leaderMap = new Map(dashboard.leaders.map((leader) => [leader.categoryKey, leader]));
    const orderedLeaders = CATEGORY_ORDER.map((key) => leaderMap.get(key)).filter((leader): leader is CategoryLeader => Boolean(leader));
    const missingCategories = CATEGORY_ORDER.filter((key) => !leaderMap.has(key));
    const hasManualHype = hype.videos.some((video) => video.sourceKind === 'youtube-hype-manual');

    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>YouTube Intelligence</p><h1>Líderes · 24h</h1></div>
          <div className={styles.headerActions}>
            <div className={styles.marketSwitch} aria-label="Mercado observado">
              <span className={styles.marketActive}>Brasil</span><span className={styles.marketFuture}>Estados Unidos · em breve</span>
            </div>
            <div className={styles.status}>
              <strong>Última coleta válida</strong><span>{formatDateTime(dashboard.collectedAt)} · mercado BR</span>
              <span>{dashboard.ageHours.toFixed(1)}h desde a atualização</span>
            </div>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>YOUTUBE BRASIL · VÍDEOS PUBLICADOS NAS ÚLTIMAS 24 HORAS</p>
            <h2>Um líder por grande mercado.</h2>
            <p>Quatro universos independentes: Notícias e Política, Ciência e Tecnologia, Economia / Mercados e Entretenimento. Cada líder vem da pesquisa do YouTube configurada para o mercado Brasil (`regionCode=BR`), com relevância em português, janela de 24 horas e os filtros editoriais do projeto.</p>
          </div>
          <LeaderRefreshButton canRefresh={dashboard.canRefresh} nextRefreshAt={dashboard.nextRefreshAt} />
        </section>

        <section className={styles.grid} aria-label="Quatro líderes do mercado brasileiro do YouTube nas últimas 24 horas">
          {orderedLeaders.map((leader) => <LeaderCard key={leader.categoryKey} leader={leader} />)}
        </section>

        {missingCategories.length ? <div className={styles.error}>Ainda faltam dados válidos para: {missingCategories.join(', ')}. As demais colunas preservam o último líder válido salvo no banco.</div> : null}

        <section className={styles.sectionBlock} aria-labelledby="hype-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>BRASIL · HYPE</p>
              <h2 id="hype-heading">Mais Hypados</h2>
              <p>{hasManualHype
                ? 'Top 4 informado a partir da lista Hype do YouTube Brasil, já com exclusão de música e conteúdo infantil. As posições abaixo preservam a ordem do ranking informado.'
                : 'Os quatro vídeos com maior Hype Score no último snapshot válido do nosso modelo, considerando força viral, Network Escape, breakout, velocidade, engajamento e dificuldade estrutural do canal.'}</p>
            </div>
            {hype.observedHour ? <div className={styles.hypeTimestamp}><strong>{hasManualHype ? 'Ranking registrado' : 'Último snapshot de Hype'}</strong><span>{formatDateTime(hype.observedHour)}</span></div> : null}
          </div>

          {hype.videos.length ? (
            <section className={styles.grid} aria-label="Quatro vídeos mais hypados no mercado brasileiro">
              {hype.videos.map((video) => <HypeCard key={video.videoId} video={video} />)}
            </section>
          ) : <div className={styles.hypeUnavailable}>Ainda não existe um ranking Hype válido salvo. A descoberta automática do YouTube está temporariamente limitada pela cota de Search Queries.</div>}

          {hype.apiWarning ? <div className={styles.hypeWarning}>O ranking salvo continua disponível, mas a atualização de metadados do YouTube falhou: {hype.apiWarning}</div> : null}
        </section>

        <div className={styles.note}>
          <strong>Escopo atual:</strong> mercado YouTube Brasil (`regionCode=BR`) e `relevanceLanguage=pt`. Notícias e Política usa a categoria 25; Ciência e Tecnologia, a categoria 28; Entretenimento, a categoria 24; Economia / Mercados usa Business + termos econômicos. Conteúdo infantil/infantojuvenil, música e os demais bloqueios editoriais continuam excluídos. O mercado está explícito no modelo para permitir adicionar Estados Unidos depois como uma leitura separada, sem misturar BR e US.
        </div>
      </main>
    );
  } catch (error) {
    return <main className={styles.page}><header className={styles.header}><div><p className={styles.eyebrow}>YouTube Intelligence</p><h1>Líderes · 24h</h1></div></header><div className={styles.error}>Não foi possível carregar uma coleta válida: {error instanceof Error ? error.message : 'erro desconhecido'}.</div></main>;
  }
}
