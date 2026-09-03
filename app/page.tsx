import Image from 'next/image';
import { LeaderRefreshButton } from '@/app/components/LeaderRefreshButton';
import styles from '@/app/leaders.module.css';
import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
import type { CategoryLeader } from '@/lib/youtube-category-leaders';

export const dynamic = 'force-dynamic';

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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
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
              alt=""
              width={960}
              height={540}
              sizes="(max-width: 980px) 100vw, 33vw"
              priority
            />
          ) : null}
          <span className={styles.category}>{leader.categoryLabel}</span>
        </div>

        <div className={styles.cardBody}>
          <h3>{leader.title}</h3>
          <span className={styles.channel}>{leader.channelTitle}</span>

          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Views</span>
              <strong>{compactNumber.format(leader.views)}</strong>
            </div>
            <div className={styles.metric}>
              <span>Views / hora</span>
              <strong>{compactNumber.format(Math.round(leader.viewsPerHour))}</strong>
            </div>
            <div className={styles.metric}>
              <span>Inscritos do canal</span>
              <strong>{leader.subscribers == null ? '—' : compactNumber.format(leader.subscribers)}</strong>
            </div>
            <div className={styles.metric}>
              <span>Engajamento</span>
              <strong>{formatPercent(leader.engagementRate)}</strong>
            </div>
          </div>

          <div className={styles.cardFooter}>
            <span>publicado {formatDateTime(leader.publishedAt)}</span>
            <span>{formatDuration(leader.durationSeconds)} · {leader.candidateCount} candidatos</span>
          </div>
        </div>
      </a>
    </article>
  );
}

export default async function Home() {
  try {
    const dashboard = await getLeaderDashboard();
    const missingCategories = ['news-politics', 'economia', 'entretenimento'].filter(
      (key) => !dashboard.leaders.some((leader) => leader.categoryKey === key)
    );

    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>YouTube Intelligence Brasil</p>
            <h1>Líderes · 24h</h1>
          </div>
          <div className={styles.status}>
            <strong>Última coleta válida</strong>
            <span>{formatDateTime(dashboard.collectedAt)} · Brasil</span>
            <span>{dashboard.ageHours.toFixed(1)}h desde a atualização</span>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>VÍDEOS PUBLICADOS NAS ÚLTIMAS 24 HORAS</p>
            <h2>O vídeo e o canal que lideram cada mercado agora.</h2>
            <p>
              Ranking por total de views entre vídeos long-form elegíveis publicados nas últimas 24h no Brasil.
              News & Politics usa a categoria 25 do YouTube; Entretenimento usa a categoria 24; Economia usa o tópico
              Business com termos econômicos em português. O último resultado válido permanece salvo no Neon.
            </p>
          </div>
          <LeaderRefreshButton canRefresh={dashboard.canRefresh} nextRefreshAt={dashboard.nextRefreshAt} />
        </section>

        <section className={styles.grid} aria-label="Líderes das últimas 24 horas">
          {dashboard.leaders.map((leader) => <LeaderCard key={leader.categoryKey} leader={leader} />)}
        </section>

        {missingCategories.length || dashboard.errors.length ? (
          <div className={styles.error}>
            A última coleta não conseguiu preencher todos os universos. O site mantém os resultados válidos já obtidos.
            {dashboard.errors.length ? ` Detalhe: ${dashboard.errors.map((item) => `${item.categoryKey}: ${item.message}`).join(' | ')}` : ''}
          </div>
        ) : null}

        <div className={styles.note}>
          <strong>Definição desta tela:</strong> “últimas 24h” significa vídeos <em>publicados</em> nas últimas 24 horas,
          ordenados pelas views acumuladas até a coleta. Isso é diferente de “views ganhas nas últimas 24h” por vídeos
          mais antigos; essa segunda métrica exige snapshots temporais e continuará sendo tratada separadamente.
          O botão de atualização só é liberado após 12 horas e a mesma regra é validada no servidor.
        </div>
      </main>
    );
  } catch (error) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>YouTube Intelligence Brasil</p>
            <h1>Líderes · 24h</h1>
          </div>
        </header>
        <div className={styles.error}>
          Não foi possível criar a primeira coleta: {error instanceof Error ? error.message : 'erro desconhecido'}.
          Assim que uma coleta válida for persistida, o dashboard deixará de depender de uma consulta ao vivo para renderizar.
        </div>
      </main>
    );
  }
}
