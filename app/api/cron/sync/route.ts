import { providerConfig } from '@/lib/infrastructure';
import { getCurrentPopularity, type CurrentPopularitySnapshot } from '@/lib/youtube-popularity';
import { persistYoutubePopularitySnapshot } from '@/lib/youtube-history-db';
import { getSocialBladeYouTubeStats, isSocialBladeConfigured, socialBladeHistoryMode } from '@/lib/socialblade';
import { ensureSocialBladeSchema, upsertSocialBladeStats } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isSocialBladeSyncEnabled(): boolean {
  return process.env.SOCIALBLADE_ENABLED === 'true';
}

async function syncSocialBlade(radar: CurrentPopularitySnapshot): Promise<{
  enabled: boolean;
  configured: boolean;
  attempted: number;
  stored: number;
  failures: Array<{ channelId: string; error: string }>;
  history: string;
  stoppedReason?: string;
}> {
  const enabled = isSocialBladeSyncEnabled();
  if (!enabled || !isSocialBladeConfigured() || !process.env.DATABASE_URL) {
    return {
      enabled,
      configured: enabled && isSocialBladeConfigured(),
      attempted: 0,
      stored: 0,
      failures: [],
      history: socialBladeHistoryMode()
    };
  }

  await ensureSocialBladeSchema();
  const maxChannels = Math.max(1, Math.min(20, Number(process.env.SOCIALBLADE_MAX_CHANNELS_PER_SYNC ?? 8)));

  const priorityIds = [
    ...radar.mostPopularByTopic.map((item) => item.video.channelId),
    ...radar.publishedLast24hByTopic.map((item) => item.video.channelId),
    ...radar.mostPopular.map((video) => video.channelId),
    ...radar.publishedLast24h.map((video) => video.channelId)
  ];

  const channelIds = [...new Set(priorityIds.filter(Boolean))].slice(0, maxChannels);
  const failures: Array<{ channelId: string; error: string }> = [];
  let stored = 0;
  let attempted = 0;
  let stoppedReason: string | undefined;

  // Deliberately sequential: Social Blade calls can consume credits. This allows the
  // collector to stop immediately on exhausted credits or another account-level error.
  for (const channelId of channelIds) {
    attempted += 1;
    try {
      const stats = await getSocialBladeYouTubeStats(channelId);
      await upsertSocialBladeStats(stats);
      stored += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Social Blade sync error';
      failures.push({ channelId, error: message });

      if (message === 'insufficient_credits') {
        stoppedReason = 'insufficient_credits';
        break;
      }
    }
  }

  return {
    enabled,
    configured: true,
    attempted,
    stored,
    failures,
    history: socialBladeHistoryMode(),
    stoppedReason
  };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // The sync mutates historical datasets and consumes provider quota. Keep it private
  // even when all currently enabled collectors are free.
  if (!secret) {
    return Response.json(
      {
        ok: false,
        error: 'cron_secret_required',
        message: 'Set CRON_SECRET in Vercel before enabling recurring historical collection.'
      },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const radar = await getCurrentPopularity();
  const youtubeHistory = await persistYoutubePopularitySnapshot(radar);
  const socialblade = await syncSocialBlade(radar);

  return Response.json({
    ok: radar.ok,
    mode: 'collect',
    message: socialblade.enabled
      ? socialblade.stoppedReason === 'insufficient_credits'
        ? 'YouTube history stored; Social Blade stopped because the account has insufficient credits.'
        : 'YouTube history and enabled auxiliary providers synchronized.'
      : 'YouTube network-breakout history persisted to Neon; Social Blade is disabled.',
    configuredProviders: providerConfig,
    youtubeHistory,
    socialblade,
    ranAt: new Date().toISOString()
  });
}
