import { describe, it, expect, afterAll } from "vitest";
import { spawn, spawnSync } from "child_process";
import { randomBytes } from "crypto";
import pg from "pg";

/* The REAL hooks of route.pg.test.ts (FOLD 1 AMENDED, RULING 4231 (1)): its beforeAll guard and its afterAll drop.
   Each arm runs that file as a child vitest against a scratch database and reads the database AFTER the child exits.
   Needs SETUP_PG_URL (a throwaway database whose role may CREATE DATABASE); it creates and drops only the database
   named <SETUP_PG_URL's database>_wi3996_hooks. It fails loud without SETUP_PG_URL, never skips. */

const url = process.env.SETUP_PG_URL;
const PG_TEST = "src/app/api/setup/complete/route.pg.test.ts";
// the database name is the last path segment (WHATWG URL rejects the socket form postgresql://user@/db?host=...)
const m = url?.match(/^([^?]*\/)([^/?]+)(\?.*)?$/);
const hooksDb = m ? `${decodeURIComponent(m[2])}_wi3996_hooks` : "";
const hooksUrl = m ? `${m[1]}${encodeURIComponent(hooksDb)}${m[3] ?? ""}` : "";
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function onDb<T>(target: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: target });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function freshHooksDb(setupSql?: string) {
  expect(url, "SETUP_PG_URL must name a throwaway PostgreSQL database").toBeTruthy();
  expect(m, "SETUP_PG_URL must end in /<database>").toBeTruthy();
  await onDb(url!, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${ident(hooksDb)} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${ident(hooksDb)}`);
  });
  if (setupSql) await onDb(hooksUrl, (c) => c.query(setupSql));
}

function runPgTest() {
  const env: Record<string, string | undefined> = { ...process.env, SETUP_PG_URL: hooksUrl };
  for (const k of Object.keys(env)) if (k.startsWith("VITEST") || k === "DATABASE_URL") delete env[k];
  const r = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", PG_TEST], { env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 120_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, "") };
}

const publicTables = () =>
  onDb(hooksUrl, async (c) => (await c.query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name`)).rows.map((r) => r.table_name as string));

describe("route.pg.test.ts hooks, read from outside the file", () => {
  afterAll(async () => {
    if (m) await onDb(url!, (c) => c.query(`DROP DATABASE IF EXISTS ${ident(hooksDb)} WITH (FORCE)`));
  });

  it("(a) the beforeAll guard refuses a database holding a non-throwaway table BEFORE any statement; its marked row survives", async () => {
    await freshHooksDb(`CREATE TABLE public.schema_migrations(version text); INSERT INTO public.schema_migrations VALUES ('041');
      CREATE TABLE public.tenants(id text, name text); INSERT INTO public.tenants VALUES ('real', 'keep')`);
    const run = runPgTest();
    expect(run.status, run.out).not.toBe(0);
    expect(run.out).toContain("not a throwaway database (it holds schema_migrations)");
    expect(await onDb(hooksUrl, async (c) => (await c.query("SELECT name FROM public.tenants WHERE id = 'real'")).rows))
      .toEqual([{ name: "keep" }]);
    expect(await publicTables(), "no statement ran: users and agents were never created").toEqual(["schema_migrations", "tenants"]);
  }, 150_000);

  it("(b) after a passing run, the afterAll drop leaves public.tenants, users and agents ABSENT", async () => {
    await freshHooksDb();
    const run = runPgTest();
    expect(run.status, run.out).toBe(0);
    expect(run.out).toMatch(/Tests\s+6 passed \(6\)/);
    expect(await publicTables()).toEqual([]);
  }, 150_000);
});

/* A test may destroy only what it made (FOLD 2, RULING 4236). Each arm runs THIS file's two arms above as a child
   vitest (-t filter) and reads, after the child exits, a database the ARM made. Every name here is unique per run. */
const SELF = "src/app/api/setup/complete/route.pg.hooks.test.ts";
const urlFor = (db: string) => `${m![1]}${encodeURIComponent(db)}${m![3] ?? ""}`;
const runTag = () => `${process.pid}_${randomBytes(4).toString("hex")}`;

function runSelf(env: Record<string, string>): Promise<{ status: number | null; out: string }> {
  const e: Record<string, string | undefined> = { ...process.env, ...env };
  for (const k of Object.keys(e)) if (k.startsWith("VITEST") || k === "DATABASE_URL") delete e[k];
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", SELF, "-t", "read from outside the file"],
      { env: e as NodeJS.ProcessEnv });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("close", (status) => resolve({ status, out: out.replace(/\x1b\[[0-9;]*m/g, "") }));
  });
}

/** CREATE DATABASE (plain: a name that exists fails) with a marker table; returns a dropper for exactly that name. */
async function ownDb(name: string, marker = true) {
  await onDb(url!, (c) => c.query(`CREATE DATABASE ${ident(name)}`));
  if (marker) await onDb(urlFor(name), (c) => c.query("CREATE TABLE public.protected_marker(v text); INSERT INTO public.protected_marker VALUES ('keep')"));
  return {
    marker: () => onDb(urlFor(name), async (c) => (await c.query("SELECT v FROM public.protected_marker")).rows).catch((e: Error) => e.message),
    drop: () => onDb(url!, (c) => c.query(`DROP DATABASE IF EXISTS ${ident(name)}`)),
  };
}

describe("hooks scratch database: only what the run made (FOLD 2, RULING 4236)", () => {
  it("(c) a pre-existing database under the OLD fixed name <setup db>_wi3996_hooks survives a full run, marker intact", async () => {
    expect(url, "SETUP_PG_URL must name a throwaway PostgreSQL database").toBeTruthy();
    const parentName = `wi3996_f2c_${runTag()}`; // a unique throwaway parent, so this arm never meets another run's names
    const parent = await ownDb(parentName, false);
    const sibling = await ownDb(`${parentName}_wi3996_hooks`);
    try {
      const run = await runSelf({ SETUP_PG_URL: urlFor(parentName) });
      expect(run.status, run.out).toBe(0);
      expect(await sibling.marker()).toEqual([{ v: "keep" }]);
    } finally {
      await sibling.drop();
      await parent.drop();
    }
  }, 300_000);

  it("(d) two runs at once on one SETUP_PG_URL both pass", async () => {
    expect(url, "SETUP_PG_URL must name a throwaway PostgreSQL database").toBeTruthy();
    const [r1, r2] = await Promise.all([runSelf({ SETUP_PG_URL: url! }), runSelf({ SETUP_PG_URL: url! })]);
    expect(r1.status, r1.out).toBe(0);
    expect(r2.status, r2.out).toBe(0);
  }, 300_000);

  it("(e) a name collision (test seam WI3996_HOOKS_SUFFIX_TEST) refuses and drops nothing", async () => {
    expect(url, "SETUP_PG_URL must name a throwaway PostgreSQL database").toBeTruthy();
    const seam = `collide_${runTag()}`;
    const taken = await ownDb(`wi3996_hooks_${seam}_a`);
    try {
      const run = await runSelf({ SETUP_PG_URL: url!, WI3996_HOOKS_SUFFIX_TEST: seam });
      expect(run.status, run.out).not.toBe(0);
      expect(run.out).toContain(`scratch database wi3996_hooks_${seam}_a already exists: refused, nothing dropped`);
      expect(await taken.marker()).toEqual([{ v: "keep" }]);
    } finally {
      await taken.drop();
    }
  }, 300_000);
});
