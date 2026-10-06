import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

/* First-run setup on REAL PostgreSQL (FOLD 1, deck-main RULING 4174; transformate WI-3991). Needs SETUP_PG_URL
   (a throwaway database; the tables below are dropped and recreated). It fails loud without one, never skips.
   The route and src/lib/db.ts run unmocked; only pg's Client.query is wrapped, to hold each setup-guard read at a
   barrier until both callers have read (the reviewer's race harness), or 1.5 s when the second caller cannot read.
   Guard (transformate WI-3996): npm test now collects this file, so before it drops anything it refuses a database
   that holds any table in schema public other than tenants, users and agents (a migrated dev database), and it
   drops those three in afterAll so a rerun on the same throwaway database passes. */

const url = process.env.SETUP_PG_URL;
process.env.DATABASE_URL = url;

let reads = 0;
let release: () => void = () => {};
let barrier: Promise<void> | null = null;
function armBarrier() {
  reads = 0;
  barrier = new Promise<void>((r) => { release = r; setTimeout(r, 1500); });
}
function atGuardRead(): Promise<void> {
  if (!barrier) return Promise.resolve();
  if (++reads === 2) release();
  return barrier;
}
const origQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  const first = args[0] as string | { text?: string };
  const text = typeof first === "string" ? first : first?.text ?? "";
  if (!text.includes("AS default_tenants")) return (origQuery as (...a: unknown[]) => unknown).apply(this, args);
  const cb = args[args.length - 1];
  if (typeof cb === "function") {
    args[args.length - 1] = (err: unknown, res: unknown) => { atGuardRead().then(() => cb(err, res)); };
    return (origQuery as (...a: unknown[]) => unknown).apply(this, args);
  }
  return ((origQuery as (...a: unknown[]) => Promise<unknown>).apply(this, args)).then(async (res) => { await atGuardRead(); return res; });
} as typeof pg.Client.prototype.query;

const admin = new pg.Pool({ connectionString: url });

async function post(body: unknown) {
  const { POST } = await import("./route");
  const res = await POST(new NextRequest("https://arkon.test/api/setup/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}

const nonSystemAgents = async () =>
  (await admin.query("SELECT id FROM public.agents WHERE id <> 'system' ORDER BY id")).rows.map((r) => r.id as string);

/** Throws unless the database holds no table in schema public beyond tenants, users and agents (WI-3996 guard),
 *  and unqualified names resolve to public: the route and src/lib/db.ts run unqualified SQL (FOLD 1 belt). */
async function throwawayGuard() {
  const schema = (await admin.query("SELECT current_schema() AS s")).rows[0].s as string | null;
  if (schema !== "public") throw new Error(`SETUP_PG_URL is not a throwaway database (current schema ${schema}, not public): nothing dropped`);
  const { rows } = await admin.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name NOT IN ('tenants', 'users', 'agents') ORDER BY table_name`);
  if (rows.length) throw new Error(`SETUP_PG_URL is not a throwaway database (it holds ${rows.map((r) => r.table_name).join(", ")}): nothing dropped`);
}
// Every statement names schema public (FOLD 1, RULING 4231): search_path ("$user", public by default) can never
// move a DROP or CREATE into a schema the guard did not read.
const RESET_SQL = `DROP TABLE IF EXISTS public.agents, public.users, public.tenants;
  CREATE TABLE public.tenants(id text PRIMARY KEY, name text, admin_email text, setup_completed boolean NOT NULL DEFAULT false, updated_at timestamptz);
  CREATE TABLE public.users(id serial PRIMARY KEY, role text NOT NULL DEFAULT 'viewer', is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.agents(id text PRIMARY KEY, name text, description text, framework text, token_hash text,
    tenant_id text REFERENCES public.tenants(id), created_at timestamptz, updated_at timestamptz);
  INSERT INTO public.tenants(id) VALUES ('default'); INSERT INTO public.agents(id, tenant_id) VALUES ('system', 'default');`;
const DROP_SQL = "DROP TABLE IF EXISTS public.agents, public.users, public.tenants";
let guarded = false;

describe("POST /api/setup/complete on PostgreSQL", () => {
  beforeAll(async () => {
    if (!url) return; // beforeEach fails loud
    await throwawayGuard();
    guarded = true;
  });
  beforeEach(async () => {
    expect(url, "SETUP_PG_URL must name a throwaway PostgreSQL database").toBeTruthy();
    if (!guarded) throw new Error("the throwaway-database guard did not pass: nothing dropped");
    barrier = null;
    await admin.query(RESET_SQL);
  });
  afterAll(async () => {
    if (guarded) await admin.query(DROP_SQL);
    await admin.end();
    const db = await import("@/lib/db");
    await db.default.end();
  });

  it("(0) the guard refuses a database with another table in schema public (transformate WI-3996)", async () => {
    await admin.query("CREATE TABLE public.wi3996_guard_probe(x int)");
    try {
      await expect(throwawayGuard()).rejects.toThrow(/not a throwaway database \(it holds wi3996_guard_probe\)/);
    } finally {
      await admin.query("DROP TABLE public.wi3996_guard_probe");
    }
    await expect(throwawayGuard()).resolves.toBeUndefined();
  });

  it("(0b) G2: a schema named after the connecting role holds real tables: the guard refuses, its marked row survives (FOLD 1, RULING 4231)", async () => {
    const role = (await admin.query("SELECT current_user AS r")).rows[0].r as string;
    const S = `"${role.replace(/"/g, '""')}"`;
    await admin.query(`CREATE SCHEMA ${S}; CREATE TABLE ${S}.tenants(id text, name text); INSERT INTO ${S}.tenants VALUES ('real', 'keep');
      CREATE TABLE ${S}.users(id int); CREATE TABLE ${S}.agents(id text)`);
    let refused = false;
    let kept: unknown[] = [];
    try {
      refused = await throwawayGuard().then(() => false, () => true);
      if (!refused) { await admin.query(RESET_SQL); await admin.query(DROP_SQL); } // what the run would do next
    } finally {
      kept = (await admin.query(`SELECT name FROM ${S}.tenants WHERE id = 'real'`).catch(() => ({ rows: [] }))).rows;
      await admin.query(`DROP SCHEMA ${S} CASCADE`);
    }
    expect(kept).toEqual([{ name: "keep" }]);
    expect(refused).toBe(true);
  });

  it("(0c) a connection whose search_path puts another schema first moves no DROP or CREATE out of public (FOLD 1, RULING 4231)", async () => {
    await admin.query(`DROP SCHEMA IF EXISTS wi3996_shadow CASCADE; CREATE SCHEMA wi3996_shadow;
      CREATE TABLE wi3996_shadow.tenants(id text); CREATE TABLE wi3996_shadow.users(id int); CREATE TABLE wi3996_shadow.agents(id text);
      INSERT INTO wi3996_shadow.tenants VALUES ('shadow'); INSERT INTO wi3996_shadow.users VALUES (7); INSERT INTO wi3996_shadow.agents VALUES ('shadow')`);
    const shadowRows = async () => (await admin.query(`SELECT (SELECT string_agg(id, ',') FROM wi3996_shadow.tenants) t,
      (SELECT string_agg(id::text, ',') FROM wi3996_shadow.users) u, (SELECT string_agg(id, ',') FROM wi3996_shadow.agents) a`)).rows[0];
    const c = new pg.Client({ connectionString: url, options: "-c search_path=wi3996_shadow,public" });
    await c.connect();
    try {
      expect((await c.query("SELECT current_schema() AS s")).rows[0].s).toBe("wi3996_shadow");
      // start from an empty public: a CREATE that meets an existing table would roll back the whole reset and hide a moved DROP
      await admin.query("DROP TABLE IF EXISTS public.agents, public.users, public.tenants");
      await c.query(RESET_SQL);
      expect((await admin.query("SELECT to_regclass('public.tenants') IS NOT NULL AS t")).rows[0].t, "RESET_SQL created public.tenants").toBe(true);
      expect(await shadowRows()).toEqual({ t: "shadow", u: "7", a: "shadow" });
      await c.query(DROP_SQL);
      expect((await admin.query("SELECT to_regclass('public.tenants') IS NULL AS t")).rows[0].t, "DROP_SQL dropped public.tenants").toBe(true);
      expect(await shadowRows()).toEqual({ t: "shadow", u: "7", a: "shadow" });
    } finally {
      await c.end();
      await admin.query("DROP SCHEMA IF EXISTS wi3996_shadow CASCADE");
    }
  });

  it("(1) an owner user, no agents: step 'agent' is refused, no token, no agent", async () => {
    await admin.query("INSERT INTO public.users(role) VALUES ('owner')");
    const res = await post({ step: "agent", agent_name: "Unauthorized bot" });
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("token");
    expect(await nonSystemAgents()).toEqual([]);
  });

  it("(2) two concurrent first-agent callers, distinct names: exactly one token, one agent", async () => {
    armBarrier();
    const results = await Promise.all([
      post({ step: "agent", agent_name: "Owner first bot" }),
      post({ step: "agent", agent_name: "Attacker concurrent bot" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
    expect(results.filter((r) => typeof r.body.token === "string")).toHaveLength(1);
    expect(await nonSystemAgents()).toHaveLength(1);
  });

  it("(3) a fresh install: the first agent still gets its token (guard)", async () => {
    const res = await post({ step: "agent", agent_name: "My Bot" });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^ark_/);
    expect(await nonSystemAgents()).toEqual(["my-bot"]);
  });
});
