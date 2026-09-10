const YOUTUBE_API_ROOT = 'https://www.googleapis.com/youtube/v3';
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{10,150}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

type PlaylistItem = {
  snippet?: {
    position?: number;
    resourceId?: { videoId?: string };
  };
  contentDetails?: { videoId?: string };
};

type PlaylistItemsResponse = {
  items?: PlaylistItem[];
};

export type YoutubePlaylistImportErrorCode =
  | 'invalid_youtube_playlist_url'
  | 'youtube_api_key_not_configured'
  | 'youtube_playlist_fetch_failed'
  | 'youtube_playlist_has_fewer_than_10_videos'
  | 'youtube_playlist_contains_duplicate_videos_top_10';

export class YoutubePlaylistImportError extends Error {
  constructor(
    public readonly code: YoutubePlaylistImportErrorCode,
    public readonly status: number,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = 'YoutubePlaylistImportError';
  }
}

export function parseYoutubePlaylistId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (PLAYLIST_ID_RE.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!YOUTUBE_HOSTS.has(host)) return null;

    const playlistId = (url.searchParams.get('list') ?? '').trim();
    return PLAYLIST_ID_RE.test(playlistId) ? playlistId : null;
  } catch {
    return null;
  }
}

export async function getTopYoutubePlaylistVideoIds(input: string, limit: number = 10): Promise<{
  playlistId: string;
  videoIds: string[];
}> {
  const playlistId = parseYoutubePlaylistId(input);
  if (!playlistId) {
    throw new YoutubePlaylistImportError('invalid_youtube_playlist_url', 400);
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new YoutubePlaylistImportError('youtube_api_key_not_configured', 503);
  }

  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const url = new URL(`${YOUTUBE_API_ROOT}/playlistItems`);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', String(safeLimit));
  url.searchParams.set('key', apiKey);

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new YoutubePlaylistImportError(
      'youtube_playlist_fetch_failed',
      response.status === 404 ? 404 : 502,
      {
        playlistId,
        upstreamStatus: response.status,
        upstreamMessage: body.slice(0, 300)
      }
    );
  }

  const payload = await response.json() as PlaylistItemsResponse;
  const ranked = (payload.items ?? [])
    .map((item, index) => ({
      videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '',
      position: Number.isFinite(item.snippet?.position) ? Number(item.snippet?.position) : index
    }))
    .filter((item) => VIDEO_ID_RE.test(item.videoId))
    .sort((a, b) => a.position - b.position)
    .slice(0, safeLimit);

  const videoIds = ranked.map((item) => item.videoId);
  if (videoIds.length < safeLimit) {
    throw new YoutubePlaylistImportError('youtube_playlist_has_fewer_than_10_videos', 400, {
      playlistId,
      found: videoIds.length,
      required: safeLimit
    });
  }

  if (new Set(videoIds).size !== videoIds.length) {
    throw new YoutubePlaylistImportError('youtube_playlist_contains_duplicate_videos_top_10', 400, {
      playlistId
    });
  }

  return { playlistId, videoIds };
}
