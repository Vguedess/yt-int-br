import { authorizeCronRequest } from '@/lib/cron-auth';
import { getCurrentPopularity } from '@/lib/youtube-popularity';
import { persistYoutubePopularitySnapshot } from '@/lib/youtube-history-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const radar = await getCurrentPopularity();
  const youtubeHistory = await persistYoutubePopularitySnapshot(radar);

  return Response.json({
    ok: radar.ok,
    mode: 'discovery',
    message: radar.ok
      ? 'Macro discovery completed and network-aware candidates persisted to Neon.'
      : 'Discovery ran, but one or more YouTube sources were unavailable.',
    networkModelVersion: radar.networkModelVersion,
    youtubeHistory,
    ranAt: new Date().toISOString(),
    error: radar.error
  }, { status: radar.ok ? 200 : 503 });
}
