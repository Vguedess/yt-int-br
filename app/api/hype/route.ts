import { NextResponse } from 'next/server';
import { getHypeDashboard } from '@/lib/youtube-hype-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dashboard = await getHypeDashboard();
    return NextResponse.json({ ok: dashboard.videos.length > 0, dashboard }, {
      status: dashboard.videos.length ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha desconhecida ao carregar Hype.'
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
