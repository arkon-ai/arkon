import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import pg from "pg";

/* First-run setup on REAL PostgreSQL (FOLD 1, deck-main RULING 4174; transformate WI-3991). Needs SETUP_PG_URL
   (a throwaway database; the tables below are dropped and recreated). It fails loud without one, never skips.
   The route and src/lib/db.ts run unmocked; only pg's Client.query is wrapped, to hold each setup-guard read at a
   barrier until both callers have read (the reviewer's race harness), or 1.5 s when the second caller cannot read. */

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
  (await admin.query("SELECT id FROM agents WHERE id <> 'system' ORDER BY id")).rows.map((r) => r.id as string);

describe("POST /api/setup/complete on PostgreSQL", () => {
  beforeEach(async () => {
    expect(url, "SETUP_PG_URL must name a throwaway PostgreSQL database").toBeTruthy();
    barrier = null;
    await admin.query(`DROP TABLE IF EXISTS agents, users, tenants;
      CREATE TABLE tenants(id text PRIMARY KEY, name text, admin_email text, setup_completed boolean NOT NULL DEFAULT false, updated_at timestamptz);
      CREATE TABLE users(id serial PRIMARY KEY, role text NOT NULL DEFAULT 'viewer', is_active boolean NOT NULL DEFAULT true);
      CREATE TABLE agents(id text PRIMARY KEY, name text, description text, framework text, token_hash text,
        tenant_id text REFERENCES tenants(id), created_at timestamptz, updated_at timestamptz);
      INSERT INTO tenants(id) VALUES ('default'); INSERT INTO agents(id, tenant_id) VALUES ('system', 'default');`);
  });
  afterAll(async () => {
    await admin.end();
    const db = await import("@/lib/db");
    await db.default.end();
  });

  it("(1) an owner user, no agents: step 'agent' is refused, no token, no agent", async () => {
    await admin.query("INSERT INTO users(role) VALUES ('owner')");
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
