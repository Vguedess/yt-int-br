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

  for (let index = 0; index < channelIds.length; index += 3) {
    const batch = channelIds.slice(index, index + 3);
    const results = await Promise.allSettled(
      batch.map(async (channelId) => {
        const stats = await getSocialBladeYouTubeStats(channelId);
        await upsertSocialBladeStats(stats);
      })
    );

    results.forEach((result, batchIndex) => {
      const channelId = batch[batchIndex];
      if (result.status === 'fulfilled') stored += 1;
      else failures.push({
        channelId,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown Social Blade sync error'
      });
    });
  }

  return {
    configured: true,
    attempted: channelIds.length,
    stored,
    failures,
    history: socialBladeHistoryMode()
  };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (secret && authorization !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const socialblade = await syncSocialBlade();

  return Response.json({
    ok: true,
    mode: 'collect',
    message: socialblade.configured
      ? 'YouTube radar collected and Social Blade channel history persisted to Neon.'
      : 'Core sync ran; Social Blade awaits credentials or database configuration.',
    configuredProviders: providerConfig,
    socialblade,
    ranAt: new Date().toISOString()
  });
}
