import { Pool } from 'pg';
import type { ChannelRankingCategory, ChannelRankingSnapshotRow } from '@/lib/channel-ranking-snapshots';

const globalForChannelRankingDb = globalThis as unknown as { channelRankingPool?: Pool };

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');

  if (!globalForChannelRankingDb.channelRankingPool) {
    globalForChannelRankingDb.channelRankingPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalForChannelRankingDb.channelRankingPool;
}

export async function ensureChannelRankingSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS channel_ranking_snapshots (
      snapshot_date DATE NOT NULL,
      country_code TEXT NOT NULL,
      category TEXT NOT NULL,
      ranking_scope TEXT NOT NULL DEFAULT 'top-by-lifetime-views',
      source_type TEXT NOT NULL DEFAULT 'user-provided',
      reported_rank INTEGER NOT NULL,
      filtered_rank INTEGER,
      channel_name TEXT NOT NULL,
      subscribers BIGINT NOT NULL,
      views BIGINT NOT NULL,
      videos BIGINT NOT NULL,
      excluded BOOLEAN NOT NULL DEFAULT FALSE,
      exclusion_reason TEXT,
      inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (snapshot_date, country_code, category, channel_name)
    );

    CREATE INDEX IF NOT EXISTS channel_ranking_snapshots_lookup_idx
      ON channel_ranking_snapshots (snapshot_date DESC, country_code, category, excluded, filtered_rank, reported_rank);
  `);
}

function withFilteredRanks(rows: ChannelRankingSnapshotRow[]): Array<ChannelRankingSnapshotRow & { filteredRank: number | null }> {
  const counters = new Map<ChannelRankingCategory, number>();
  return [...rows]
    .sort((a, b) => a.category.localeCompare(b.category) || a.reportedRank - b.reportedRank)
    .map((row) => {
      if (row.excluded) return { ...row, filteredRank: null };
      const next = (counters.get(row.category) ?? 0) + 1;
      counters.set(row.category, next);
      return { ...row, filteredRank: next };
    });
}

export async function upsertChannelRankingSnapshot(rows: ChannelRankingSnapshotRow[]): Promise<{ stored: number; excluded: number }> {
  await ensureChannelRankingSchema();
  const pool = getPool();
  const client = await pool.connect();
  const rankedRows = withFilteredRanks(rows);

  try {
    await client.query('BEGIN');
    for (const row of rankedRows) {
      await client.query(
        `INSERT INTO channel_ranking_snapshots (
          snapshot_date, country_code, category, ranking_scope, source_type,
          reported_rank, filtered_rank, channel_name,
          subscribers, views, videos, excluded, exclusion_reason, inserted_at
        ) VALUES (
          $1::date, $2, $3, 'top-by-lifetime-views', 'user-provided',
          $4, $5, $6, $7, $8, $9, $10, $11, NOW()
        )
        ON CONFLICT (snapshot_date, country_code, category, channel_name) DO UPDATE SET
          reported_rank = EXCLUDED.reported_rank,
          filtered_rank = EXCLUDED.filtered_rank,
          subscribers = EXCLUDED.subscribers,
          views = EXCLUDED.views,
          videos = EXCLUDED.videos,
          excluded = EXCLUDED.excluded,
          exclusion_reason = EXCLUDED.exclusion_reason,
          inserted_at = NOW()`,
        [
          row.snapshotDate,
          row.countryCode,
          row.category,
          row.reportedRank,
          row.filteredRank,
          row.channelName,
          row.subscribers,
          row.views,
          row.videos,
          row.excluded,
          row.exclusionReason
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    stored: rankedRows.length,
    excluded: rankedRows.filter((row) => row.excluded).length
  };
}

export type StoredChannelRanking = {
  snapshotDate: string;
  countryCode: string;
  category: string;
  reportedRank: number;
  filteredRank: number | null;
  channelName: string;
  subscribers: number;
  views: number;
  videos: number;
  excluded: boolean;
  exclusionReason: string | null;
};

export async function getChannelRankingSnapshot(input: {
  snapshotDate?: string;
  countryCode?: string;
  category?: ChannelRankingCategory;
  includeExcluded?: boolean;
} = {}): Promise<StoredChannelRanking[]> {
  await ensureChannelRankingSchema();
  const pool = getPool();
  const snapshotDate = input.snapshotDate ?? '2026-09-02';
  const countryCode = input.countryCode ?? 'BR';
  const values: unknown[] = [snapshotDate, countryCode];
  const clauses = ['snapshot_date = $1::date', 'country_code = $2'];

  if (input.category) {
    values.push(input.category);
    clauses.push(`category = $${values.length}`);
  }
  if (!input.includeExcluded) clauses.push('excluded = FALSE');

  const result = await pool.query<{
    snapshot_date: Date;
    country_code: string;
    category: string;
    reported_rank: number;
    filtered_rank: number | null;
    channel_name: string;
    subscribers: string;
    views: string;
    videos: string;
    excluded: boolean;
    exclusion_reason: string | null;
  }>(
    `SELECT snapshot_date, country_code, category, reported_rank, filtered_rank,
            channel_name, subscribers, views, videos, excluded, exclusion_reason
     FROM channel_ranking_snapshots
     WHERE ${clauses.join(' AND ')}
     ORDER BY category, COALESCE(filtered_rank, 999999), reported_rank`,
    values
  );

  return result.rows.map((row) => ({
    snapshotDate: row.snapshot_date.toISOString().slice(0, 10),
    countryCode: row.country_code,
    category: row.category,
    reportedRank: row.reported_rank,
    filteredRank: row.filtered_rank,
    channelName: row.channel_name,
    subscribers: Number(row.subscribers),
    views: Number(row.views),
    videos: Number(row.videos),
    excluded: row.excluded,
    exclusionReason: row.exclusion_reason
  }));
}
