import { NextResponse } from 'next/server';
import { persistManualHypeSnapshot } from '@/lib/youtube-history-db';

export const dynamic = 'force-dynamic';

const BATCH_ID = 'manual-youtube-hype-br-2026-09-03-user-curated-01';
const VIDEO_IDS = [
  'qjXEOUHV01Q',
  'Lj6-YFDQ_kk',
  'tLRUFH0UGEo',
  'S5Xh6HEoMMs'
];

export async function GET() {
  try {
    const snapshot = await persistManualHypeSnapshot({
      batchId: BATCH_ID,
      market: 'BR',
      videoIds: VIDEO_IDS,
      source: 'YouTube Hype Brasil · ranking manual informado pelo usuário',
      filters: ['exclude_music', 'exclude_kids_and_youth_low_quality']
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error'
    }, { status: 500 });
  }
}
