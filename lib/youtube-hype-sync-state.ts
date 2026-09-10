import { Pool } from 'pg';

const globalForHypeSync = globalThis as unknown as { ytHypeSyncPool?: Pool };

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');

  if (!globalForHypeSync.ytHypeSyncPool) {
    globalForHypeSync.ytHypeSyncPool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalForHypeSync.ytHypeSyncPool;
}

export type HypePlaylistSyncState = {
  market: string;
  playlistId: string;
  playlistUrl: string;
  lastCheckedAt: string;
  lastChangedAt: string | null;
  lastBatchId: string | null;
  lastError: string | null;
};

async function ensureHypePlaylistSyncSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_hype_playlist_state (
      market TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL,
      playlist_url TEXT NOT NULL,
      last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_changed_at TIMESTAMPTZ,
      last_batch_id TEXT,
      last_error TEXT
    );
  `);
}

export async function getHypePlaylistSyncState(
  market: string = 'BR'
): Promise<HypePlaylistSyncState | null> {
  await ensureHypePlaylistSyncSchema();
  const pool = getPool();
  const result = await pool.query<{
    market: string;
    playlist_id: string;
    playlist_url: string;
    last_checked_at: Date;
    last_changed_at: Date | null;
    last_batch_id: string | null;
    last_error: string | null;
  }>(`
    SELECT market, playlist_id, playlist_url, last_checked_at,
           last_changed_at, last_batch_id, last_error
    FROM youtube_hype_playlist_state
    WHERE market = $1
    LIMIT 1
  `, [market]);

  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    market: row.market,
    playlistId: row.playlist_id,
    playlistUrl: row.playlist_url,
    lastCheckedAt: row.last_checked_at.toISOString(),
    lastChangedAt: row.last_changed_at?.toISOString() ?? null,
    lastBatchId: row.last_batch_id,
    lastError: row.last_error
  };
}

export async function recordHypePlaylistSyncState(input: {
  market: string;
  playlistId: string;
  playlistUrl: string;
  checkedAt: string;
  changedAt?: string | null;
  batchId?: string | null;
  error?: string | null;
}): Promise<void> {
  await ensureHypePlaylistSyncSchema();
  const pool = getPool();
  await pool.query(`
    INSERT INTO youtube_hype_playlist_state (
      market, playlist_id, playlist_url, last_checked_at,
      last_changed_at, last_batch_id, last_error
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (market) DO UPDATE SET
      playlist_id = EXCLUDED.playlist_id,
      playlist_url = EXCLUDED.playlist_url,
      last_checked_at = EXCLUDED.last_checked_at,
      last_changed_at = COALESCE(EXCLUDED.last_changed_at, youtube_hype_playlist_state.last_changed_at),
      last_batch_id = COALESCE(EXCLUDED.last_batch_id, youtube_hype_playlist_state.last_batch_id),
      last_error = EXCLUDED.last_error
  `, [
    input.market,
    input.playlistId,
    input.playlistUrl,
    input.checkedAt,
    input.changedAt ?? null,
    input.batchId ?? null,
    input.error ?? null
  ]);
}

export async function withHypePlaylistSyncLock<T>(
  market: string,
  operation: () => Promise<T>
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  await ensureHypePlaylistSyncSchema();
  const pool = getPool();
  const client = await pool.connect();
  const lockKey = `youtube-hype-playlist-sync:${market}`;

  try {
    const lock = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS acquired',
      [lockKey]
    );

    if (!lock.rows[0]?.acquired) return { acquired: false };

    try {
      return { acquired: true, value: await operation() };
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [lockKey]);
    }
  } finally {
    client.release();
  }
}
