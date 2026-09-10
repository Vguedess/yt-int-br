import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { persistManualHypeSnapshot } from '@/lib/youtube-history-db';
import {
  getTopYoutubePlaylistVideoIds,
  YoutubePlaylistImportError
} from '@/lib/youtube-playlist';

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

function jsonNoStore(payload: Record<string, unknown>, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(request: NextRequest) {
  const auth = authorize(request);
  if (!auth.ok) {
    return jsonNoStore({ ok: false, error: auth.error }, auth.status);
  }

  try {
    const body = await request.json() as { links?: unknown; playlistUrl?: unknown };
    const playlistUrl = typeof body.playlistUrl === 'string' ? body.playlistUrl.trim() : '';

    let videoIds: string[];
    let source: string;
    let filters: string[];
    let playlistId: string | null = null;

    if (playlistUrl) {
      const imported = await getTopYoutubePlaylistVideoIds(playlistUrl, 10);
      videoIds = imported.videoIds;
      playlistId = imported.playlistId;
      source = `YouTube Hype Brasil · playlist ${playlistId} · ordem oficial da playlist`;
      filters = ['youtube_hype_playlist', 'playlist_order_top_10'];
    } else {
      if (!Array.isArray(body.links)) {
        return jsonNoStore({ ok: false, error: 'links_must_be_an_array' }, 400);
      }

      if (body.links.length !== 10) {
        return jsonNoStore({ ok: false, error: 'exactly_10_links_required' }, 400);
      }

      const ids = body.links.map((value) => parseYoutubeVideoId(String(value ?? '')));
      const invalidRanks = ids
        .map((id, index) => id ? null : index + 1)
        .filter((rank): rank is number => rank != null);

      if (invalidRanks.length) {
        return jsonNoStore({
          ok: false,
          error: 'invalid_youtube_links',
          invalidRanks
        }, 400);
      }

      videoIds = ids as string[];
      if (new Set(videoIds).size !== 10) {
        return jsonNoStore({ ok: false, error: 'duplicate_video_links' }, 400);
      }

      source = 'YouTube Hype Brasil · top 10 manual pelo painel';
      filters = ['exclude_music', 'exclude_kids_and_youth_low_quality', 'manual_top_10'];
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = await persistManualHypeSnapshot({
      batchId: `manual-youtube-hype-br-${stamp}-${randomUUID().slice(0, 8)}`,
      market: 'BR',
      videoIds,
      source,
      filters
    });

    return jsonNoStore({
      ok: true,
      snapshot,
      playlistId,
      videoIds,
      message: playlistId
        ? 'Top 10 importado da playlist e salvo como novo snapshot, preservando a ordem #1 a #10.'
        : 'Top 10 Hype salvo como novo snapshot. O lote anterior permanece no histórico.'
    }, 201);
  } catch (error) {
    if (error instanceof YoutubePlaylistImportError) {
      return jsonNoStore({
        ok: false,
        error: error.code,
        ...error.details
      }, error.status);
    }

    return jsonNoStore({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha desconhecida ao salvar Hype manual.'
    }, 500);
  }
}
