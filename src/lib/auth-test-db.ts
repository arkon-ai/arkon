import pg from "pg";

/* Test support for the U5 sign-in set (transformate WI-4492, WI-4493, WI-4498): ONE private database per pg test
   file on the throwaway cluster scripts/with-throwaway-pg.sh starts (SETUP_PG_URL), dropped by drop(). It holds the
   credential tables in the form of the migrations (users and user_sessions: 006, api_keys and magic_link_tokens:
   010, agents: 000/001), so the SQL in request-auth.ts and the auth routes runs for real: an expired session or an
   inactive users row is refused by PostgreSQL, not by a mock. Fake values only. Never imported by app code. */

const AUTH_TABLES_SQL = `
CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE users (
  id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','operator','viewer','tenant_user')),
  tenant_id TEXT REFERENCES tenants(id), is_active BOOLEAN NOT NULL DEFAULT TRUE, last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL, ip_address TEXT, user_agent TEXT, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id), name TEXT NOT NULL DEFAULT 'fake', key_prefix TEXT NOT NULL DEFAULT 'ak_live_',
  key_hash TEXT NOT NULL, scopes TEXT[] DEFAULT '{}', expires_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'fake', token_hash TEXT, role TEXT DEFAULT 'operator', tenant_id TEXT);
CREATE TABLE magic_link_tokens (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO tenants (id, name) VALUES ('tenant-a', 'Tenant A');
`;

export const AUTH_TABLES = ["tenants", "users", "user_sessions", "api_keys", "agents", "magic_link_tokens"];

/** The credential reads of src/lib/request-auth.ts and tools/_utils.ts resolveApiKey (and nothing else). */
export function isCredentialSql(text: string): boolean {
  return /JOIN user_sessions s ON s\.user_id = u\.id/.test(text)
    || /FROM api_keys\s+WHERE key_hash = \$1/.test(text)
    || /UPDATE api_keys SET last_used_at = NOW\(\) WHERE id = \$1/.test(text)
    || /FROM agents WHERE token_hash = \$1/.test(text);
}

/** True when every table the statement names is one of the credential tables above. */
export function touchesOnlyAuthTables(text: string): boolean {
  const names = [...text.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z0-9_.]*)/gi)].map((m) => m[1].toLowerCase());
  return names.length > 0 && names.every((n) => AUTH_TABLES.includes(n));
}

export interface AuthDb {
  pool: pg.Pool;
  drop: () => Promise<void>;
}

export async function createAuthDb(tag: string): Promise<AuthDb> {
  const base = process.env.SETUP_PG_URL;
  if (!base) throw new Error("SETUP_PG_URL must name the throwaway PostgreSQL of scripts/with-throwaway-pg.sh");
  if (!/^[a-z0-9_]+$/.test(tag)) throw new Error(`bad database tag ${tag}`);
  const name = `u5_${tag}_${process.pid}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 4 });
  await pool.query(AUTH_TABLES_SQL);
  return {
    pool,
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: base });
      await a.connect();
      try {
        await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}
