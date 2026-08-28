const SOCIALBLADE_API_ROOT = 'https://matrix.sbapis.com/b';

export type SocialBladeHistoryMode = 'default' | 'extended' | 'archive';

export type SocialBladeDailyPoint = {
  date: string;
  subs: number;
  views: number;
};

export type SocialBladeYouTubeStats = {
  channelId: string;
  displayName: string;
  handle?: string;
  totalSubscribers: number | null;
  totalViews: number | null;
  totalUploads: number | null;
  subscriberGrowth: Partial<Record<'1' | '3' | '7' | '14' | '30' | '60' | '90' | '180' | '365', number>>;
  viewGrowth: Partial<Record<'1' | '3' | '7' | '14' | '30' | '60' | '90' | '180' | '365', number>>;
  daily: SocialBladeDailyPoint[];
  creditsAvailable: number | null;
};

type SocialBladeApiResponse = {
  status?: {
    success?: boolean;
    status?: number;
    error?: string;
  };
  info?: {
    credits?: {
      available?: number;
    };
  };
  data?: {
    id?: {
      id?: string;
      display_name?: string;
      handle?: string;
    };
    statistics?: {
      total?: {
        uploads?: number;
        subscribers?: number;
        views?: number;
      };
      growth?: {
        subs?: Record<string, number>;
        vidviews?: Record<string, number>;
      };
    };
    daily?: Array<{
      date?: string;
      subs?: number;
      views?: number;
    }>;
  };
};

export function isSocialBladeConfigured(): boolean {
  return Boolean(process.env.SOCIALBLADE_CLIENT_ID && process.env.SOCIALBLADE_TOKEN);
}

export function socialBladeHistoryMode(): SocialBladeHistoryMode {
  const value = process.env.SOCIALBLADE_HISTORY;
  if (value === 'extended' || value === 'archive') return value;
  return 'default';
}

export async function getSocialBladeYouTubeStats(
  channelId: string,
  history: SocialBladeHistoryMode = socialBladeHistoryMode()
): Promise<SocialBladeYouTubeStats> {
  const clientId = process.env.SOCIALBLADE_CLIENT_ID;
  const token = process.env.SOCIALBLADE_TOKEN;
  if (!clientId || !token) {
    throw new Error('Social Blade credentials are not configured');
  }

  const url = new URL(`${SOCIALBLADE_API_ROOT}/youtube/statistics`);
  url.searchParams.set('query', channelId);
  url.searchParams.set('history', history);
  url.searchParams.set('allow-stale', 'false');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      clientid: clientId,
      token
    },
    cache: 'no-store'
  });

  const body = (await response.json()) as SocialBladeApiResponse;
  if (!response.ok || !body.status?.success || !body.data?.id?.id) {
    throw new Error(body.status?.error || `Social Blade API ${response.status}`);
  }

  const total = body.data.statistics?.total;
  const growth = body.data.statistics?.growth;
  const daily = (body.data.daily ?? [])
    .filter((point): point is { date: string; subs: number; views: number } =>
      Boolean(point.date) && Number.isFinite(point.subs) && Number.isFinite(point.views)
    )
    .map((point) => ({ date: point.date, subs: point.subs, views: point.views }));

  return {
    channelId: body.data.id.id,
    displayName: body.data.id.display_name ?? channelId,
    handle: body.data.id.handle,
    totalSubscribers: Number.isFinite(total?.subscribers) ? total!.subscribers! : null,
    totalViews: Number.isFinite(total?.views) ? total!.views! : null,
    totalUploads: Number.isFinite(total?.uploads) ? total!.uploads! : null,
    subscriberGrowth: growth?.subs ?? {},
    viewGrowth: growth?.vidviews ?? {},
    daily,
    creditsAvailable: Number.isFinite(body.info?.credits?.available) ? body.info!.credits!.available! : null
  };
}
