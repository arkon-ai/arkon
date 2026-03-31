import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied(): Promise<Set<string>> {
  const result = await pool.query("SELECT name FROM _migrations ORDER BY id");
  return new Set(result.rows.map((r: { name: string }) => r.name));
}

async function run() {
  const migrationsDir = join(process.cwd(), "migrations");
  await ensureMigrationsTable();

  // Advisory lock to prevent concurrent migrations (e.g. multi-instance PM2)
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(1234)");
    console.log("[migrate] Acquired advisory lock");

    const applied = await getApplied();

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf-8");
      console.log(`[migrate] Applying ${file}...`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        count++;
        console.log(`[migrate] Applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] FAILED on ${file}:`, err);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    if (count === 0) {
      console.log("[migrate] All migrations already applied.");
    } else {
      console.log(`[migrate] Applied ${count} migration(s).`);
    }
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(1234)");
    lockClient.release();
    console.log("[migrate] Released advisory lock");
  }

  await pool.end();
}

run().catch((err) => {
  console.error("[migrate] Fatal:", err);
  process.exit(1);
});
