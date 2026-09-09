import Image from 'next/image';
import { LeaderRefreshButton } from '@/app/components/LeaderRefreshButton';
import base from '@/app/leaders.module.css';
import styles from './vguedess.module.css';
import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
import { getHypeDashboard, type HypeVideoCard } from '@/lib/youtube-hype-service';
import { buildTopicRanking } from '@/lib/topic-ranking';
import { enrichTopicRankingWithX } from '@/lib/x-topic-service';
import type { CategoryLeader, LeaderCategoryKey } from '@/lib/youtube-category-leaders';
import {
  getVguedessChannelProfile,
  personalizeRankingForVguedess,
  VGUEDESS_EDITORIAL_BENCHMARKS,
  VGUEDESS_INTERESTS,
  type VguedessTopicDecision
} from '@/lib/vguedess-channel-profile';

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short'
  }).format(new Date(value));
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes} min`;
}

function decisionLabel(value: VguedessTopicDecision['decision']): string {
  const labels: Record<VguedessTopicDecision['decision'], string> = {
    PRIORIDADE_ALTA: 'Prioridade alta',
    CONSIDERAR: 'Considerar',
    OBSERVAR: 'Observar',
    EVITAR_REPETICAO: 'Evitar repetição',
    FORA_DO_FOCO: 'Fora do foco'
  };
  return labels[value];
}

function LeaderCard({ leader }: { leader: CategoryLeader }) {
  return (
    <article className={base.card}>
      <a className={base.cardLink} href={`https://www.youtube.com/watch?v=${leader.videoId}`} target="_blank" rel="noreferrer">
        <div className={base.imageWrap}>
          {leader.thumbnailUrl ? (
            <Image
              className={base.image}
              src={leader.thumbnailUrl}
              alt={`Thumbnail de ${leader.title}`}
              width={960}
              height={540}
              sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw"
            />
          ) : <div className={base.imageFallback}>Sem thumbnail</div>}
          <span className={base.category}>{leader.categoryLabel}</span>
        </div>
        <div className={base.cardBody}>
          <h3>{leader.title}</h3>
          <dl className={base.details}>
            <div><dt>Canal</dt><dd>{leader.channelTitle}</dd></div>
            <div><dt>Inscritos</dt><dd>{leader.subscribers == null ? '—' : compactNumber.format(leader.subscribers)}</dd></div>
            <div><dt>Duração</dt><dd>{formatDuration(leader.durationSeconds)}</dd></div>
            <div><dt>Views</dt><dd>{compactNumber.format(leader.views)}</dd></div>
          </dl>
          <div className={base.cardFooter}>
            <span>Publicado {formatDateTime(leader.publishedAt)}</span>
            <span>Mercado YouTube BR · {leader.candidateCount} candidatos</span>
          </div>
        </div>
      </a>
    </article>
  );
}

function HypeCard({ video }: { video: HypeVideoCard }) {
  const manual = video.sourceKind === 'youtube-hype-manual';
  return (
    <article className={`${base.card} ${base.hypeCard}`}>
      <a className={base.cardLink} href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noreferrer">
        <div className={base.imageWrap}>
          <Image
            className={base.image}
            src={video.thumbnailUrl}
            alt={`Thumbnail de ${video.title}`}
            width={960}
            height={540}
            sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 25vw"
          />
          <span className={base.hypeRank}>HYPE #{video.rank}</span>
          {!manual && video.hypeScore != null ? <span className={base.hypeScore}>Score {video.hypeScore}</span> : null}
        </div>
        <div className={base.cardBody}>
          <h3>{video.title}</h3>
          <dl className={base.details}>
            <div><dt>Canal</dt><dd>{video.channelTitle}</dd></div>
            <div><dt>Inscritos</dt><dd>{video.subscribers == null ? '—' : compactNumber.format(video.subscribers)}</dd></div>
            <div><dt>Duração</dt><dd>{formatDuration(video.durationSeconds)}</dd></div>
            <div><dt>Views</dt><dd>{video.currentViews ? compactNumber.format(video.currentViews) : '—'}</dd></div>
          </dl>
          <div className={base.cardFooter}>
            <span>{manual ? 'Ranking Hype do YouTube Brasil' : `Hype Score interno · breakout ${video.breakoutStrength ?? '—'}`}</span>
            <span>Snapshot {formatDateTime(video.observedHour)}</span>
          </div>
        </div>
      </a>
    </article>
  );
}

function OpportunityCard({ topic }: { topic: VguedessTopicDecision }) {
  return (
    <article className={styles.opportunityCard}>
      <div className={styles.opportunityTop}>
        <div className={styles.rankBlock}>
          <span className={styles.personalRank}>#{topic.personalizedRank}</span>
          <span className={styles.marketRank}>mercado #{topic.marketRank}</span>
        </div>
        <span className={styles.decisionBadge}>{decisionLabel(topic.decision)}</span>
      </div>

      <h3>{topic.label}</h3>

      <div className={styles.scoreHero}>
        <span>Oportunidade para @vguedess</span>
        <strong>{topic.personalizedOpportunityScore}</strong>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metric}><span>Mercado</span><strong>{topic.opportunityScore}/100</strong></div>
        <div className={styles.metric}><span>Fit editorial</span><strong>{topic.interestFitScore}/100</strong></div>
        <div className={styles.metric}><span>Momentum</span><strong>{topic.momentumScore}/100</strong></div>
        <div className={styles.metric}><span>Saturação</span><strong>{topic.saturationScore}/100</strong></div>
        <div className={styles.metric}><span>Breakout</span><strong>{topic.breakoutScore}/100</strong></div>
        <div className={styles.metric}><span>Fadiga</span><strong>{topic.fatiguePenalty}/55</strong></div>
      </div>

      <div className={styles.formatBox}>
        <span>Formato preferencial</span>
        <p>{topic.preferredFormat}</p>
      </div>

      <div className={styles.reasonBlock}>
        <strong>Por que entra</strong>
        {topic.positiveReasons.slice(0, 3).map((reason) => <span key={reason}>• {reason}</span>)}
      </div>

      {topic.cautionReasons.length ? (
        <div className={styles.reasonBlock}>
          <strong>Restrições / cuidado</strong>
          {topic.cautionReasons.slice(0, 2).map((reason) => <span key={reason}>• {reason}</span>)}
        </div>
      ) : null}

      <div className={styles.cardFooter}>
        <span>{topic.timingLabel}</span>
        <span>{topic.matchedInterest ?? 'Sem cluster de interesse forte'} · {topic.recentOverlapCount} sobreposição(ões) recente(s)</span>
      </div>
    </article>
  );
}

function PersonalizedTopicRow({ topic }: { topic: VguedessTopicDecision }) {
  return (
    <article className={base.topicRow}>
      <div className={base.topicRank}>#{topic.personalizedRank}</div>
      <div className={base.topicIdentity}>
        <div className={base.topicTitleLine}>
          <h3>{topic.label}</h3>
          <span className={base.topicStage}>{decisionLabel(topic.decision)}</span>
        </div>
        <div className={base.topicTags}>
          {topic.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className={base.topicEvidence}>
          {topic.evidence.map((video) => (
            <span key={video.videoId}>{video.source === 'youtube-hype' ? `Hype #${video.sourceRank}` : 'Líder 24h'} · {video.channelTitle}</span>
          ))}
        </div>
      </div>
      <div className={base.topicScores}>
        <div className={base.topicMetric}><div><span>@vguedess</span><strong>{topic.personalizedOpportunityScore}</strong></div><div className={base.topicBar}><span style={{ width: `${topic.personalizedOpportunityScore}%` }} /></div></div>
        <div className={base.topicMetric}><div><span>Mercado</span><strong>{topic.opportunityScore}</strong></div><div className={base.topicBar}><span style={{ width: `${topic.opportunityScore}%` }} /></div></div>
        <div className={base.topicMetric}><div><span>Fit</span><strong>{topic.interestFitScore}</strong></div><div className={base.topicBar}><span style={{ width: `${topic.interestFitScore}%` }} /></div></div>
        <div className={base.topicMetric}><div><span>Fadiga</span><strong>{topic.fatiguePenalty}</strong></div><div className={base.topicBar}><span style={{ width: `${Math.min(100, topic.fatiguePenalty * 1.8)}%` }} /></div></div>
      </div>
      <div className={base.topicMeta}>
        <span>Mercado #{topic.marketRank} → pessoal #{topic.personalizedRank}</span>
        <span>{topic.timingLabel}</span>
        <span>{topic.matchedInterest ?? 'Fora dos interesses centrais'}</span>
        {topic.xSignal.xMomentumScore != null ? <span>X Momentum: {topic.xSignal.xMomentumScore}/100</span> : null}
      </div>
    </article>
  );
}

export default async function VguedessRadar() {
  try {
    const [dashboard, hype, channelProfile] = await Promise.all([
      getLeaderDashboard(),
      getHypeDashboard(),
      getVguedessChannelProfile()
    ]);

    const leaderMap = new Map(dashboard.leaders.map((leader) => [leader.categoryKey, leader]));
    const orderedLeaders = CATEGORY_ORDER
      .map((key) => leaderMap.get(key))
      .filter((leader): leader is CategoryLeader => Boolean(leader));

    const topicRanking = await enrichTopicRankingWithX(buildTopicRanking(orderedLeaders, hype.videos));
    const personalized = personalizeRankingForVguedess(topicRanking, channelProfile);
    const topPersonalized = personalized.topics.slice(0, 3);
    const longFormRecent = channelProfile?.recentVideos.filter((video) => (video.durationSeconds ?? 0) >= 480).slice(0, 6) ?? [];

    return (
      <main className={base.page}>
        <header className={base.header}>
          <div>
            <p className={base.eyebrow}>YouTube Intelligence · perfil de canal</p>
            <h1>@vguedess</h1>
          </div>
          <div className={base.headerActions}>
            <div className={styles.inlineNav}>
              <a href="/">Radar geral</a>
              <a href="/studio">Studio de Roteiro →</a>
            </div>
            <div className={base.status}>
              <strong>Última coleta de mercado</strong>
              <span>{formatDateTime(dashboard.collectedAt)} · BR</span>
              <span>{dashboard.ageHours.toFixed(1)}h desde a atualização</span>
            </div>
          </div>
        </header>

        <section className={styles.profileHero}>
          <div className={styles.profileHeroCopy}>
            <p className={base.eyebrow}>MERCADO × INTERESSES × HISTÓRICO DO CANAL</p>
            <h2>O que vale a pena produzir para este canal agora?</h2>
            <p>
              Esta cópia do radar não procura simplesmente o maior trend. O mercado gera candidatos; seus interesses editoriais aumentam ou reduzem a utilidade; e os uploads recentes do próprio canal funcionam como restrição de repetição. O objetivo é buscar crescimento sem deslocar o canal para assuntos que não combinam com o que você quer produzir.
            </p>
          </div>

          <div className={styles.channelPanel}>
            <div className={styles.channelIdentity}>
              <span>Canal observado</span>
              <strong>{channelProfile?.title ?? '@vguedess'}</strong>
              <span>{channelProfile ? `Dados consultados ${formatDateTime(channelProfile.fetchedAt)}` : 'Perfil da API indisponível nesta carga'}</span>
            </div>
            <div className={styles.channelStats}>
              <div className={styles.channelStat}><span>Inscritos</span><strong>{channelProfile?.subscribers == null ? '—' : compactNumber.format(channelProfile.subscribers)}</strong></div>
              <div className={styles.channelStat}><span>Views do canal</span><strong>{channelProfile ? compactNumber.format(channelProfile.totalViews) : '—'}</strong></div>
              <div className={styles.channelStat}><span>Vídeos</span><strong>{channelProfile ? compactNumber.format(channelProfile.videoCount) : '—'}</strong></div>
            </div>
            <LeaderRefreshButton canRefresh={dashboard.canRefresh} nextRefreshAt={dashboard.nextRefreshAt} />
          </div>
        </section>

        <section className={base.sectionBlock} aria-labelledby="personal-heading">
          <div className={styles.sectionIntro}>
            <div>
              <p className={base.eyebrow}>DECISÃO PERSONALIZADA</p>
              <h2 id="personal-heading">Prioridades para @vguedess</h2>
              <p>
                O score pessoal preserva a oportunidade de mercado como componente dominante, adiciona aderência aos interesses e aplica penalidade quando o canal publicou recentemente sobre assunto semelhante. Ele é uma camada de decisão, não uma previsão causal de views.
              </p>
            </div>
            <div className={base.hypeTimestamp}>
              <strong>{personalized.channelProfileAvailable ? 'Histórico do canal ativo' : 'Sem histórico nesta carga'}</strong>
              <span>{topicRanking.universeVideoCount} vídeos no universo de mercado</span>
            </div>
          </div>

          <div className={styles.personalGrid}>
            {topPersonalized.map((topic) => <OpportunityCard key={topic.key} topic={topic} />)}
          </div>

          <div className={styles.methodNote}>
            O ranking pessoal atual usa 64% do Opportunity Score de mercado, 24% de aderência editorial e 12% de frescor, com penalidade adicional por repetição recente. Os pesos são provisórios até existir histórico suficiente de resultados do próprio canal para calibração.
          </div>
        </section>

        <section className={base.sectionBlock} aria-labelledby="constraints-heading">
          <div className={styles.sectionIntro}>
            <div>
              <p className={base.eyebrow}>FUNÇÃO DE RESTRIÇÃO</p>
              <h2 id="constraints-heading">Interesses e memória recente</h2>
              <p>O canal não precisa perseguir qualquer assunto viral. A prioridade é encontrar interseções entre atenção de mercado, interesse genuíno e espaço editorial ainda útil.</p>
            </div>
          </div>

          <div className={styles.constraintGrid}>
            <div className={styles.interestPanel}>
              <h3>Interesses editoriais centrais</h3>
              <div className={styles.interestList}>
                {VGUEDESS_INTERESTS.map((interest) => (
                  <span className={styles.interestChip} key={interest.key}>{interest.label}<strong>{interest.weight}</strong></span>
                ))}
              </div>
              <div className={styles.benchmarkRow}>
                <span className={styles.smallLabel}>Benchmarks</span>
                {VGUEDESS_EDITORIAL_BENCHMARKS.map((channel) => <span key={channel}>{channel}</span>)}
              </div>
              <div className={styles.methodNote}>
                Os benchmarks são referências de formato, ritmo, narrativa e seleção editorial. O sistema não presume concordância política nem replica afirmações ou posicionamentos desses canais.
              </div>
            </div>

            <div className={styles.recentPanel}>
              <h3>Uploads long-form recentes</h3>
              {longFormRecent.length ? (
                <div className={styles.recentList}>
                  {longFormRecent.map((video) => (
                    <div className={styles.recentItem} key={video.videoId}>
                      <strong>{video.title}</strong>
                      <span>{formatDate(video.publishedAt)} · {compactNumber.format(video.views)} views</span>
                    </div>
                  ))}
                </div>
              ) : <div className={styles.methodNote}>Nenhum upload long-form recente pôde ser carregado nesta execução.</div>}
              {channelProfile?.warning ? <div className={styles.methodNote}>{channelProfile.warning}</div> : null}
            </div>
          </div>
        </section>

        <section className={base.sectionBlock} aria-labelledby="ranking-heading">
          <div className={styles.sectionIntro}>
            <div>
              <p className={base.eyebrow}>RANKING COMPLETO · MERCADO → CANAL</p>
              <h2 id="ranking-heading">Como os temas mudam quando o canal vira restrição</h2>
              <p>Compare a posição original do mercado com a posição personalizada. Um tema pode subir por alto fit e baixa repetição ou cair por fadiga e falta de aderência.</p>
            </div>
          </div>
          <div className={base.topicRanking}>
            {personalized.topics.map((topic) => <PersonalizedTopicRow key={topic.key} topic={topic} />)}
          </div>
        </section>

        <section className={base.sectionBlock} aria-labelledby="leaders-heading">
          <div className={styles.sectionIntro}>
            <div>
              <p className={base.eyebrow}>MERCADO BRASIL · 24H</p>
              <h2 id="leaders-heading">Sinais brutos que alimentam a decisão</h2>
              <p>Os mesmos quatro mercados da home geral continuam visíveis para que a personalização não esconda o que está acontecendo fora do foco do canal.</p>
            </div>
          </div>
          <section className={base.grid} aria-label="Líderes do mercado brasileiro nas últimas 24 horas">
            {orderedLeaders.map((leader) => <LeaderCard key={leader.categoryKey} leader={leader} />)}
          </section>
        </section>

        <section className={base.sectionBlock} aria-labelledby="hype-heading">
          <div className={styles.sectionIntro}>
            <div>
              <p className={base.eyebrow}>YOUTUBE BRASIL · HYPE</p>
              <h2 id="hype-heading">Mais Hypados</h2>
              <p>A posição do ranking Hype permanece congelada entre atualizações explícitas; hidratação de views ou metadados não altera HYPE #1–#4.</p>
            </div>
            {hype.observedHour ? <div className={base.hypeTimestamp}><strong>Snapshot salvo</strong><span>{formatDateTime(hype.observedHour)}</span></div> : null}
          </div>
          {hype.videos.length ? (
            <section className={base.grid} aria-label="Quatro vídeos mais hypados no mercado brasileiro">
              {hype.videos.map((video) => <HypeCard key={video.videoId} video={video} />)}
            </section>
          ) : <div className={base.hypeUnavailable}>Sem ranking Hype válido salvo.</div>}
        </section>

        <div className={base.note}>
          <strong>Interpretação:</strong> esta página personaliza prioridade de conteúdo, não opinião política. Para temas políticos, os formatos sugeridos priorizam análise, contexto, documentos, contrapontos e clareza factual; métricas de atenção são usadas para decidir timing e relevância, não para inferir verdade ou orientar persuasão direcionada.
        </div>
      </main>
    );
  } catch (error) {
    return (
      <main className={base.page}>
        <header className={base.header}><div><p className={base.eyebrow}>YouTube Intelligence</p><h1>@vguedess</h1></div></header>
        <div className={base.error}>Não foi possível carregar o radar personalizado: {error instanceof Error ? error.message : 'erro desconhecido'}.</div>
      </main>
    );
  }
}
