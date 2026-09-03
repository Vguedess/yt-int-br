import { authorizeCronRequest } from '@/lib/cron-auth';
import { refreshTrackedYoutubeMetrics } from '@/lib/youtube-metric-history';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const metrics = await refreshTrackedYoutubeMetrics();

  return Response.json({
    ok: metrics.configured,
    mode: 'snapshot',
    message: metrics.trackedRefs
      ? 'Tracked YouTube videos refreshed without using Search Queries.'
      : 'No tracked videos are available yet; run discovery first.',
    metrics,
    ranAt: new Date().toISOString()
  }, { status: metrics.configured ? 200 : 503 });
}
