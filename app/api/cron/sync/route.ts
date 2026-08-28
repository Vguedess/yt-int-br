import { providerConfig } from '@/lib/infrastructure';
import { getCurrentPopularity } from '@/lib/youtube-popularity';
import { getSocialBladeYouTubeStats, isSocialBladeConfigured, socialBladeHistoryMode } from '@/lib/socialblade';
import { ensureSocialBladeSchema, upsertSocialBladeStats } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function syncSocialBlade(): Promise<{
  configured: boolean;
  attempted: number;
  stored: number;
  failures: Array<{ channelId: string; error: string }>;
  history: string;
  stoppedReason?: string;
}> {
  if (!isSocialBladeConfigured() || !process.env.DATABASE_URL) {
    return { configured: false, attempted: 0, stored: 0, failures: [], history: socialBladeHistoryMode() };
  }

  await ensureSocialBladeSchema();
  const radar = await getCurrentPopularity();
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

  // Paid collectors must never be callable from a public URL without authentication.
  if (isSocialBladeConfigured() && !secret) {
    return Response.json(
      {
        ok: false,
        error: 'cron_secret_required',
        message: 'Set CRON_SECRET in Vercel before enabling the paid Social Blade collector.'
      },
      { status: 503 }
    );
  }

  const authorization = request.headers.get('authorization');
  if (secret && authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const socialblade = await syncSocialBlade();

  return Response.json({
    ok: true,
    mode: 'collect',
    message: socialblade.configured
      ? socialblade.stoppedReason === 'insufficient_credits'
        ? 'Social Blade credentials are valid, but the account has insufficient credits.'
        : 'YouTube radar collected and Social Blade channel history persisted to Neon.'
      : 'Core sync ran; Social Blade awaits credentials or database configuration.',
    configuredProviders: providerConfig,
    socialblade,
    ranAt: new Date().toISOString()
  });
}
