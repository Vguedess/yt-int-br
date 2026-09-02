import { getChannelRankingSnapshot } from '@/lib/channel-ranking-db';
import type { ChannelRankingCategory } from '@/lib/channel-ranking-snapshots';

export const dynamic = 'force-dynamic';

const categories = new Set<ChannelRankingCategory>(['news-politics', 'science-technology', 'entertainment']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? '2026-09-02';
  const categoryParam = url.searchParams.get('category');
  const includeExcluded = url.searchParams.get('includeExcluded') === 'true';
  const category = categoryParam && categories.has(categoryParam as ChannelRankingCategory)
    ? categoryParam as ChannelRankingCategory
    : undefined;

  const rows = await getChannelRankingSnapshot({
    snapshotDate: date,
    countryCode: 'BR',
    category,
    includeExcluded
  });

  return Response.json({
    ok: true,
    date,
    countryCode: 'BR',
    category: category ?? 'all',
    includeExcluded,
    count: rows.length,
    rows
  });
}
