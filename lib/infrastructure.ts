export type MemoryHorizon = 'short' | 'medium' | 'long';

export interface VectorStore {
  upsert(input: { id: string; text: string; embedding?: number[]; metadata?: Record<string, unknown>; horizon: MemoryHorizon }): Promise<void>;
  search(input: { text?: string; embedding?: number[]; limit: number; filter?: Record<string, unknown> }): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>;
}

export interface GraphStore {
  upsertNode(input: { id: string; labels: string[]; properties: Record<string, unknown> }): Promise<void>;
  upsertEdge(input: { from: string; to: string; type: string; weight?: number; lagHours?: number; confidence?: number; properties?: Record<string, unknown> }): Promise<void>;
  neighbors(id: string, depth?: number): Promise<Array<Record<string, unknown>>>;
}

export interface SignalProvider {
  name: string;
  collect(context: { country: string; language: string; since?: Date }): Promise<Array<Record<string, unknown>>>;
}

export const providerConfig = {
  youtube: Boolean(process.env.YOUTUBE_API_KEY),
  openai: Boolean(process.env.OPENAI_API_KEY),
  postgres: Boolean(process.env.DATABASE_URL),
  socialblade: Boolean(process.env.SOCIALBLADE_CLIENT_ID && process.env.SOCIALBLADE_TOKEN),
  neo4j: Boolean(process.env.NEO4J_URI),
  reddit: Boolean(process.env.REDDIT_CLIENT_ID),
  news: Boolean(process.env.NEWS_API_KEY)
};

export const futureStores = {
  vector: 'PostgreSQL + pgvector via DATABASE_URL',
  graph: 'Neo4j via NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD'
};
