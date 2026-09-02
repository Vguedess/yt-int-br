import { CHANNEL_RANKING_SNAPSHOT_2026_09_02 } from '@/lib/channel-ranking-snapshots';
import { getChannelRankingSnapshot, upsertChannelRankingSnapshot } from '@/lib/channel-ranking-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await upsertChannelRankingSnapshot(CHANNEL_RANKING_SNAPSHOT_2026_09_02);
  const storedRows = await getChannelRankingSnapshot({ snapshotDate: '2026-09-02', countryCode: 'BR', includeExcluded: true });

  return Response.json({
    ok: true,
    snapshotDate: '2026-09-02',
    countryCode: 'BR',
    stored: result.stored,
    excluded: result.excluded,
    verifiedRows: storedRows.length,
    categories: {
      newsPolitics: storedRows.filter((row) => row.category === 'news-politics').length,
      scienceTechnology: storedRows.filter((row) => row.category === 'science-technology').length,
      entertainment: storedRows.filter((row) => row.category === 'entertainment').length
    }
  });
}
