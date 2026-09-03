import type { Metadata } from 'next';
import { ScriptStudio, type StudioTopicSeed } from '@/app/components/ScriptStudio';
import styles from '@/app/studio/studio.module.css';
import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
import { getHypeDashboard } from '@/lib/youtube-hype-service';
import { buildTopicRanking } from '@/lib/topic-ranking';
import { enrichTopicRankingWithX } from '@/lib/x-topic-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio de Roteiro · YouTube Intelligence BR',
  description: 'Ambiente para transformar sinais de trending em roteiros estruturados, reordenáveis e avaliados por retenção e comunicação.'
};

async function getStudioTopics(): Promise<StudioTopicSeed[]> {
  const [leaders, hype] = await Promise.all([getLeaderDashboard(), getHypeDashboard()]);
  const base = buildTopicRanking(leaders.leaders.slice(0, 4), hype.videos.slice(0, 4));

  try {
    const enriched = await enrichTopicRankingWithX(base);
    return enriched.topics.map((topic) => ({
      key: topic.key,
      label: topic.label,
      tags: topic.tags,
      rank: topic.rank,
      opportunityScore: topic.opportunityScore,
      momentumScore: topic.momentumScore,
      saturationScore: topic.saturationScore,
      breakoutScore: topic.breakoutScore,
      xMomentumScore: topic.xSignal.xMomentumScore,
      xTrendRank: topic.xSignal.trendRank,
      xPosts24h: topic.xSignal.totalPosts24h
    }));
  } catch {
    return base.topics.map((topic) => ({
      key: topic.key,
      label: topic.label,
      tags: topic.tags,
      rank: topic.rank,
      opportunityScore: topic.opportunityScore,
      momentumScore: topic.momentumScore,
      saturationScore: topic.saturationScore,
      breakoutScore: topic.breakoutScore,
      xMomentumScore: null,
      xTrendRank: null,
      xPosts24h: null
    }));
  }
}

export default async function StudioPage() {
  let topics: StudioTopicSeed[] = [];
  let error: string | null = null;

  try {
    topics = await getStudioTopics();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Não foi possível carregar os temas atuais.';
  }

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <a className={styles.brand} href="/"><strong>YouTube Intelligence</strong><span>BR</span></a>
        <nav className={styles.nav} aria-label="Navegação principal">
          <a href="/">Radar</a>
          <a href="/studio" aria-current="page">Studio de Roteiro</a>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>IDEIA → ESTRUTURA → RETENÇÃO → ROTEIRO</span>
          <h1>Studio de Roteiro</h1>
          <p>
            Transforme sinais de atenção em uma arquitetura de vídeo. O objetivo aqui não é gerar um texto longo de uma vez:
            é decidir o núcleo, a tese, a promessa e a sequência de estados cognitivos que mantém o espectador avançando.
          </p>
        </div>
        <div className={styles.heroAside}>
          <strong>Princípio do Studio</strong>
          <span>O tema traz a atenção inicial. A estrutura converte atenção em retenção. Linguagem, surpresa, emoção, evidência e ritmo determinam se o espectador continua.</span>
          <span>Os scores são instrumentos de revisão, não prova causal de performance futura.</span>
        </div>
      </header>

      {error ? <div className={styles.heroAside}><strong>Temas atuais indisponíveis</strong><span>{error}</span><span>O editor ainda pode ser usado com um tema digitado manualmente.</span></div> : null}

      <ScriptStudio initialTopics={topics} />
    </main>
  );
}
