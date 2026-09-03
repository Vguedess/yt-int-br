import { getLeaderDashboard, refreshLeaderDashboardIfAllowed } from '@/lib/youtube-category-leader-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const dashboard = await getLeaderDashboard();
    return Response.json({ ok: true, dashboard }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar líderes.'
    }, { status: 503 });
  }
}

export async function POST() {
  try {
    const result = await refreshLeaderDashboardIfAllowed();
    return Response.json({ ok: true, ...result }, {
      status: result.refreshed ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar líderes.';
    const status = message === 'refresh_in_progress' ? 409 : 503;
    return Response.json({ ok: false, error: message }, { status });
  }
}
