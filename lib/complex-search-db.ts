import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const globalForComplexSearchDb = globalThis as unknown as { complexSearchPool?: Pool };

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');

  if (!globalForComplexSearchDb.complexSearchPool) {
    globalForComplexSearchDb.complexSearchPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000
    });
  }

  return globalForComplexSearchDb.complexSearchPool;
}

export type ComplexSearchRootTopic = {
  id: string;
  label: string;
  topicKey: string;
  createdAt: string;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function topicKey(value: string): string {
  return normalize(value).replace(/\s+/g, '-').slice(0, 120);
}

async function ensureSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS complex_search_root_topics (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      topic_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS complex_search_root_topics_created_idx
      ON complex_search_root_topics (created_at ASC);
  `);
}

export async function listComplexSearchRootTopics(): Promise<ComplexSearchRootTopic[]> {
  await ensureSchema();
  const result = await getPool().query<{
    id: string;
    label: string;
    topic_key: string;
    created_at: Date;
  }>(`
    SELECT id, label, topic_key, created_at
    FROM complex_search_root_topics
    ORDER BY created_at ASC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    topicKey: row.topic_key,
    createdAt: row.created_at.toISOString()
  }));
}

export async function addComplexSearchRootTopic(labelInput: string): Promise<ComplexSearchRootTopic> {
  const label = labelInput.replace(/\s+/g, ' ').trim();
  if (label.length < 2) throw new Error('topic_too_short');
  if (label.length > 120) throw new Error('topic_too_long');

  const key = topicKey(label);
  if (!key) throw new Error('invalid_topic');

  await ensureSchema();
  const id = randomUUID();
  const result = await getPool().query<{
    id: string;
    label: string;
    topic_key: string;
    created_at: Date;
  }>(`
    INSERT INTO complex_search_root_topics (id, label, topic_key)
    VALUES ($1, $2, $3)
    ON CONFLICT (topic_key) DO UPDATE SET label = EXCLUDED.label
    RETURNING id, label, topic_key, created_at
  `, [id, label, key]);

  const row = result.rows[0];
  return {
    id: row.id,
    label: row.label,
    topicKey: row.topic_key,
    createdAt: row.created_at.toISOString()
  };
}

export async function deleteComplexSearchRootTopic(id: string): Promise<boolean> {
  if (!id.trim()) return false;
  await ensureSchema();
  const result = await getPool().query('DELETE FROM complex_search_root_topics WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
