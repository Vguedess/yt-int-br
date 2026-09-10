import { randomUUID } from 'node:crypto';
import {
  getLatestManualHypeSnapshot,
  persistManualHypeSnapshot
} from '@/lib/youtube-history-db';
import {
  getHypePlaylistSyncState,
  recordHypePlaylistSyncState,
  withHypePlaylistSyncLock
} from '@/lib/youtube-hype-sync-state';
import { getTopYoutubePlaylistVideoIds } from '@/lib/youtube-playlist';

export const DEFAULT_HYPE_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=OLAK5uy_l52Ihsid31vpld54B2-vFiIRdej_F2_Zg';

export const HYPE_PLAYLIST_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export type HypePlaylistSyncResult = {
  market: string;
  playlistId: string | null;
  playlistUrl: string;
  checkedAt: string;
  changed: boolean;
  skipped: boolean;
  reason?: 'fresh' | 'locked';
  batchId: string | null;
  videoIds: string[];
};

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function getConfiguredPlaylistUrl(): string {
  return process.env.HYPE_PLAYLIST_URL?.trim() || DEFAULT_HYPE_PLAYLIST_URL;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Hype playlist sync error';
}

export async function syncHypePlaylist(options: {
  market?: string;
  playlistUrl?: string;
  force?: boolean;
} = {}): Promise<HypePlaylistSyncResult> {
  const market = options.market ?? 'BR';
  const playlistUrl = options.playlistUrl?.trim() || getConfiguredPlaylistUrl();
  const force = options.force ?? false;

  const before = await getLatestManualHypeSnapshot(market);
  const lock = await withHypePlaylistSyncLock(market, async () => {
    const state = await getHypePlaylistSyncState(market);
    const now = Date.now();
    const stateAge = state ? now - new Date(state.lastCheckedAt).getTime() : Number.POSITIVE_INFINITY;

    if (
      !force &&
      state?.playlistUrl === playlistUrl &&
      Number.isFinite(stateAge) &&
      stateAge >= 0 &&
      stateAge < HYPE_PLAYLIST_SYNC_INTERVAL_MS
    ) {
      const latest = await getLatestManualHypeSnapshot(market);
      return {
        market,
        playlistId: state.playlistId,
        playlistUrl,
        checkedAt: state.lastCheckedAt,
        changed: false,
        skipped: true,
        reason: 'fresh' as const,
        batchId: latest?.batchId ?? state.lastBatchId,
        videoIds: latest?.videoIds ?? []
      };
    }

    const checkedAt = new Date().toISOString();
    let playlistId = state?.playlistId ?? null;

    try {
      const imported = await getTopYoutubePlaylistVideoIds(playlistUrl, 10);
      playlistId = imported.playlistId;
      const latest = await getLatestManualHypeSnapshot(market);
      const latestIsThisPlaylist = Boolean(
        latest &&
        latest.filters.includes('youtube_hype_playlist') &&
        latest.filters.includes('auto_sync') &&
        latest.source.includes(imported.playlistId)
      );
      const changed = !latest || !arraysEqual(latest.videoIds, imported.videoIds) || !latestIsThisPlaylist;

      if (!changed) {
        await recordHypePlaylistSyncState({
          market,
          playlistId: imported.playlistId,
          playlistUrl,
          checkedAt,
          error: null
        });

        return {
          market,
          playlistId: imported.playlistId,
          playlistUrl,
          checkedAt,
          changed: false,
          skipped: false,
          batchId: latest.batchId,
          videoIds: imported.videoIds
        };
      }

      const stamp = checkedAt.replace(/[:.]/g, '-');
      const snapshot = await persistManualHypeSnapshot({
        batchId: `auto-youtube-hype-br-${stamp}-${randomUUID().slice(0, 8)}`,
        market,
        videoIds: imported.videoIds,
        source: `YouTube Hype Brasil · playlist ${imported.playlistId} · sincronização automática`,
        filters: ['youtube_hype_playlist', 'playlist_order_top_10', 'auto_sync']
      });

      await recordHypePlaylistSyncState({
        market,
        playlistId: imported.playlistId,
        playlistUrl,
        checkedAt,
        changedAt: checkedAt,
        batchId: snapshot.batchId,
        error: null
      });

      return {
        market,
        playlistId: imported.playlistId,
        playlistUrl,
        checkedAt,
        changed: true,
        skipped: false,
        batchId: snapshot.batchId,
        videoIds: imported.videoIds
      };
    } catch (error) {
      await recordHypePlaylistSyncState({
        market,
        playlistId: playlistId ?? 'unknown',
        playlistUrl,
        checkedAt,
        error: errorMessage(error).slice(0, 500)
      });
      throw error;
    }
  });

  if (!lock.acquired) {
    return {
      market,
      playlistId: null,
      playlistUrl,
      checkedAt: new Date().toISOString(),
      changed: false,
      skipped: true,
      reason: 'locked',
      batchId: before?.batchId ?? null,
      videoIds: before?.videoIds ?? []
    };
  }

  return lock.value;
}
