import { getLeaderDashboard } from '@/lib/youtube-category-leader-service';
import { getHypeDashboard } from '@/lib/youtube-hype-service';
import { buildTopicRanking } from '@/lib/topic-ranking';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [leaders, hype] = await Promise.all([getLeaderDashboard(), getHypeDashboard()]);
    const ranking = buildTopicRanking(leaders.leaders.slice(0, 4), hype.videos.slice(0, 4));
    return Response.json({ ok: true, ranking }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao construir ranking de temas.'
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
