import { authorizeCronRequest } from '@/lib/cron-auth';
import { getCurrentPopularity } from '@/lib/youtube-popularity';
import { persistYoutubePopularitySnapshot } from '@/lib/youtube-history-db';
import { syncHypePlaylist } from '@/lib/youtube-hype-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const [radar, hypePlaylistSync] = await Promise.all([
    getCurrentPopularity(),
    syncHypePlaylist({ market: 'BR', force: true })
      .then((result) => ({ ok: true as const, ...result }))
      .catch((error) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : 'Unknown Hype playlist sync error'
      }))
  ]);
  const youtubeHistory = await persistYoutubePopularitySnapshot(radar);

  return Response.json({
    ok: radar.ok,
    mode: 'discovery',
    message: radar.ok
      ? 'Macro discovery completed; Hype playlist sync was also attempted.'
      : 'Discovery ran, but one or more YouTube sources were unavailable.',
    networkModelVersion: radar.networkModelVersion,
    youtubeHistory,
    hypePlaylistSync,
    ranAt: new Date().toISOString(),
    error: radar.error
  }, { status: radar.ok ? 200 : 503 });
}
