import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { persistManualHypeSnapshot } from '@/lib/youtube-history-db';

export const dynamic = 'force-dynamic';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function authorize(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const configured = process.env.MANUAL_HYPE_SECRET ?? process.env.CRON_SECRET;
  if (!configured) return { ok: false, status: 503, error: 'manual_hype_secret_required' };

  const header = request.headers.get('authorization') ?? '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!supplied || !safeEquals(supplied, configured)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return { ok: true };
}

function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (VIDEO_ID_RE.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
      return VIDEO_ID_RE.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const fromQuery = url.searchParams.get('v') ?? '';
      if (VIDEO_ID_RE.test(fromQuery)) return fromQuery;

      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) {
        const id = parts[1] ?? '';
        return VIDEO_ID_RE.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, {
      status: auth.status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  try {
    const body = await request.json() as { links?: unknown };
    if (!Array.isArray(body.links)) {
      return NextResponse.json({ ok: false, error: 'links_must_be_an_array' }, { status: 400 });
    }

    if (body.links.length !== 10) {
      return NextResponse.json({ ok: false, error: 'exactly_10_links_required' }, { status: 400 });
    }

    const ids = body.links.map((value) => parseYoutubeVideoId(String(value ?? '')));
    const invalidRanks = ids
      .map((id, index) => id ? null : index + 1)
      .filter((rank): rank is number => rank != null);

    if (invalidRanks.length) {
      return NextResponse.json({
        ok: false,
        error: 'invalid_youtube_links',
        invalidRanks
      }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const videoIds = ids as string[];
    if (new Set(videoIds).size !== 10) {
      return NextResponse.json({ ok: false, error: 'duplicate_video_links' }, {
        status: 400,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = await persistManualHypeSnapshot({
      batchId: `manual-youtube-hype-br-${stamp}-${randomUUID().slice(0, 8)}`,
      market: 'BR',
      videoIds,
      source: 'YouTube Hype Brasil · top 10 manual pelo painel',
      filters: ['exclude_music', 'exclude_kids_and_youth_low_quality', 'manual_top_10']
    });

    return NextResponse.json({
      ok: true,
      snapshot,
      message: 'Top 10 Hype salvo como novo snapshot. O lote anterior permanece no histórico.'
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha desconhecida ao salvar Hype manual.'
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
