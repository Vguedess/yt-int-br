import Image from 'next/image';
import { LeaderRefreshButton } from '@/app/components/LeaderRefreshButton';
import styles from '@/app/leaders.module.css';
import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
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

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes} min`;
}

function LeaderCard({ leader }: { leader: CategoryLeader }) {
  return (
    <article className={styles.card}>
      <a
        className={styles.cardLink}
        href={`https://www.youtube.com/watch?v=${leader.videoId}`}
        target="_blank"
        rel="noreferrer"
      >
        <div className={styles.imageWrap}>
          {leader.thumbnailUrl ? (
            <Image
              className={styles.image}
              src={leader.thumbnailUrl}
              alt={`Thumbnail de ${leader.title}`}
              width={960}
              height={540}
              sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw"
              priority
            />
          ) : (
            <div className={styles.imageFallback}>Sem thumbnail</div>
          )}
          <span className={styles.category}>{leader.categoryLabel}</span>
        </div>

        <div className={styles.cardBody}>
          <h3>{leader.title}</h3>

          <dl className={styles.details}>
            <div>
              <dt>Canal</dt>
              <dd>{leader.channelTitle}</dd>
            </div>
            <div>
              <dt>Inscritos</dt>
              <dd>{leader.subscribers == null ? '—' : compactNumber.format(leader.subscribers)}</dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>{formatDuration(leader.durationSeconds)}</dd>
            </div>
            <div>
              <dt>Views</dt>
              <dd>{compactNumber.format(leader.views)}</dd>
            </div>
          </dl>

          <div className={styles.cardFooter}>
            <span>Publicado {formatDateTime(leader.publishedAt)}</span>
            <span>YouTube Brasil · {leader.candidateCount} candidatos</span>
          </div>
        </div>
      </a>
    </article>
  );
}

export default async function Home() {
  try {
    const dashboard = await getLeaderDashboard();
    const leaderMap = new Map(dashboard.leaders.map((leader) => [leader.categoryKey, leader]));
    const orderedLeaders = CATEGORY_ORDER
      .map((key) => leaderMap.get(key))
      .filter((leader): leader is CategoryLeader => Boolean(leader));
    const missingCategories = CATEGORY_ORDER.filter((key) => !leaderMap.has(key));

    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>YouTube Intelligence</p>
            <h1>Líderes · 24h</h1>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.marketSwitch} aria-label="Mercado observado">
              <span className={styles.marketActive}>Brasil</span>
              <span className={styles.marketFuture}>Estados Unidos · em breve</span>
            </div>
            <div className={styles.status}>
              <strong>Última coleta válida</strong>
              <span>{formatDateTime(dashboard.collectedAt)} · mercado BR</span>
              <span>{dashboard.ageHours.toFixed(1)}h desde a atualização</span>
            </div>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>YOUTUBE BRASIL · VÍDEOS PUBLICADOS NAS ÚLTIMAS 24 HORAS</p>
            <h2>Um líder por grande mercado.</h2>
            <p>
              Quatro universos independentes: Notícias e Política, Ciência e Tecnologia, Economia / Mercados e
              Entretenimento. O líder é o vídeo brasileiro long-form com mais views acumuladas entre os candidatos
              publicados nas últimas 24 horas e encontrados pela pesquisa do YouTube para o Brasil.
            </p>
          </div>
          <LeaderRefreshButton canRefresh={dashboard.canRefresh} nextRefreshAt={dashboard.nextRefreshAt} />
        </section>

        <section className={styles.grid} aria-label="Quatro líderes do YouTube brasileiro nas últimas 24 horas">
          {orderedLeaders.map((leader) => <LeaderCard key={leader.categoryKey} leader={leader} />)}
        </section>

        {missingCategories.length || dashboard.errors.length ? (
          <div className={styles.error}>
            A última coleta não conseguiu preencher todos os quatro universos. O sistema preserva os resultados válidos
            e tenta reparar snapshots incompletos.
            {dashboard.errors.length
              ? ` Detalhe: ${dashboard.errors.map((item) => `${item.categoryKey}: ${item.message}`).join(' | ')}`
              : ''}
          </div>
        ) : null}

        <div className={styles.note}>
          <strong>Escopo atual:</strong> mercado Brasil (`regionCode=BR`), relevância em português e validação do canal/
          idioma para evitar resultados estrangeiros. Notícias e Política usa a categoria 25; Ciência e Tecnologia, a
          categoria 28; Entretenimento, a categoria 24; Economia / Mercados usa Business + termos econômicos. Conteúdo
          infantil/infantojuvenil, música e os demais bloqueios editoriais do projeto continuam excluídos. A arquitetura
          mantém `BR` explícito para permitir adicionar o mercado dos Estados Unidos depois sem misturar os rankings.
        </div>
      </main>
    );
  } catch (error) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>YouTube Intelligence</p>
            <h1>Líderes · 24h</h1>
          </div>
        </header>
        <div className={styles.error}>
          Não foi possível carregar uma coleta válida: {error instanceof Error ? error.message : 'erro desconhecido'}.
        </div>
      </main>
    );
  }
}
