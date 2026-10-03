import { Pool, type QueryResult } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export default pool;

export type Query = (text: string, params?: unknown[]) => Promise<QueryResult>;

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`[db] Slow query (${duration}ms):`, text.slice(0, 100));
  }
  return res;
}

/** Run fn in ONE transaction on ONE pooled client: COMMIT when it returns, ROLLBACK when it throws. */
export async function withTransaction<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn((text, params) => client.query(text, params));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
