import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { resolve } from "path";
import type pg from "pg";
import { createAuthDb, type AuthDb } from "@/lib/auth-test-db";
import { OWNER_ONLY_ROWS, CONTENT_FACTORY_GET, routePath, type OwnerOnlyRow } from "./owner-only-rows";

/* T10, TABLE-DRIVEN (transformate WI-4498, S8): EVERY exported handler and method with a validateAdmin call row (the
   101 census rows of owner-only-rows.ts, each named by file, line and method) plus content-factory/status GET, each
   driven with twelve credentials. The owner session and the owner key by Bearer pass; a non-owner session (admin,
   operator, viewer), an agents-table token (role agent, and role admin), an ak_live_ api key, an MC_AGENT_TOKENS key,
   an INACTIVE owner row's session, an EXPIRED owner session and no credential read the route's current refusal
   (401; /api/health is PUBLIC and refuses by omitting its system details) and each refusal comes BEFORE any side
   effect: zero non-credential SQL, zero fetch, zero exec, zero ssh, zero broadcast, zero notification.
   The credential reads (request-auth.ts) run on REAL PostgreSQL (src/lib/auth-test-db.ts), so the inactive row and
   the expired session are refused by the SQL itself. Every other statement is recorded and answered with zero rows.
   Fixed FAKE values only. */

const h = vi.hoisted(() => ({ pool: null as pg.Pool | null, effects: [] as string[] }));

vi.mock("@/lib/db", async () => {
  const { isCredentialSql } = await import("@/lib/auth-test-db");
  const stub = async (text: string) => {
    h.effects.push(`db: ${String(text).replace(/\s+/g, " ").trim().slice(0, 80)}`);
    return { rows: [], rowCount: 0 };
  };
  const query = vi.fn(async (text: string, params?: unknown[]) => (h.pool && isCredentialSql(text) ? h.pool.query(text, params) : stub(text)));
  const client = { query: vi.fn(async (text: string) => stub(text)), release: vi.fn() };
  return {
    query,
    default: { query, connect: vi.fn(async () => { h.effects.push("db: pool.connect"); return client; }) },
    withTransaction: vi.fn(async (fn: (q: (t: string) => Promise<unknown>) => Promise<unknown>) => { h.effects.push("db: withTransaction"); return fn(stub); }),
  };
});
vi.mock("child_process", () => ({
  exec: vi.fn((...args: unknown[]) => {
    h.effects.push("exec");
    const cb = args[args.length - 1];
    if (typeof cb === "function") (cb as (e: Error) => void)(new Error("exec is mocked in T10"));
  }),
}));
vi.mock("@/lib/ssh-exec", async (orig) => ({
  ...(await orig<typeof import("@/lib/ssh-exec")>()),
  sshRun: vi.fn(async () => { h.effects.push("ssh"); throw new Error("ssh is mocked in T10"); }),
}));
vi.mock("@/lib/event-bus", async (orig) => ({
  ...(await orig<typeof import("@/lib/event-bus")>()),
  broadcast: vi.fn(() => { h.effects.push("broadcast"); }),
}));
vi.mock("@/lib/notifications", async (orig) => ({
  ...(await orig<typeof import("@/lib/notifications")>()),
  sendNotification: vi.fn(async () => { h.effects.push("notification"); }),
  sendLegacyAlert: vi.fn(async () => { h.effects.push("notification"); }),
}));
vi.mock("@/lib/alert-fire", () => ({
  fireAlert: vi.fn(async () => { h.effects.push("alert"); }),
  fireApprovalAlert: vi.fn(async () => { h.effects.push("alert"); }),
}));

const FAKE_OWNER_KEY = "fake-t10-owner-key-0000000000000000";
const FAKE_ENV_KEY = "FAKE-t10-envkey-q7x2m9w4p8";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

interface Cred { name: string; bearer?: string; cookie?: string; passes: boolean }
const CREDS: Cred[] = [
  { name: "owner session", cookie: "fake-t10-owner-session", passes: true },
  { name: "owner key by Bearer", bearer: FAKE_OWNER_KEY, passes: true },
  { name: "admin session", cookie: "fake-t10-admin-session", passes: false },
  { name: "operator session", cookie: "fake-t10-operator-session", passes: false },
  { name: "viewer session", cookie: "fake-t10-viewer-session", passes: false },
  { name: "agents-table token (role agent)", bearer: "fake-t10-agent-token", passes: false },
  { name: "agents-table token (role admin)", bearer: "fake-t10-agent-admin-token", passes: false },
  { name: "ak_live_ api key", bearer: "ak_live_fake_t10_api_key", passes: false },
  { name: "MC_AGENT_TOKENS key", bearer: FAKE_ENV_KEY, passes: false },
  { name: "inactive owner row session", cookie: "fake-t10-inactive-owner-session", passes: false },
  { name: "expired owner session", cookie: "fake-t10-expired-owner-session", passes: false },
  { name: "no credential", passes: false },
];

function request(row: OwnerOnlyRow, cred: Cred): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cred.bearer) headers.authorization = `Bearer ${cred.bearer}`;
  const req = new NextRequest(`https://arkon.test${routePath(row.file)}`, {
    method: row.method,
    headers,
    body: row.method === "GET" ? undefined : "{}",
  });
  if (cred.cookie) req.cookies.set("mc_auth", cred.cookie);
  return req;
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const isHealth = (row: OwnerOnlyRow) => row.file === "src/app/api/health/route.ts";

/** Drives one row with every credential; returns each mismatch (empty = the row holds the rule). */
async function driveRow(row: OwnerOnlyRow): Promise<string[]> {
  const mod = (await import(resolve(row.file))) as Record<string, Handler>;
  const handler = mod[row.method];
  if (typeof handler !== "function") return [`no exported ${row.method}`];
  const wrong: string[] = [];
  for (const cred of CREDS) {
    h.effects = [];
    let status: number;
    let body: unknown = null;
    try {
      const res = await handler(request(row, cred), { params: Promise.resolve({ id: "1", serverId: "1" }) });
      status = res.status;
      if (isHealth(row)) body = await res.json();
      else await res.body?.cancel().catch(() => {});
    } catch (e) {
      status = -1; // a throw after the check: the handler went past authorization
      if (!cred.passes) wrong.push(`${cred.name}: threw ${(e as Error).message}`);
      continue;
    }
    if (isHealth(row)) {
      const hasSystem = !!body && typeof body === "object" && "system" in body;
      if (hasSystem !== cred.passes) wrong.push(`${cred.name}: system details ${hasSystem ? "shown" : "withheld"}`);
      continue;
    }
    if (cred.passes && status === 401) wrong.push(`${cred.name}: refused 401`);
    if (!cred.passes && status !== 401) wrong.push(`${cred.name}: answered ${status}, not the refusal 401`);
    if (!cred.passes && h.effects.length > 0) wrong.push(`${cred.name}: side effect before authorization: ${h.effects.join(" | ")}`);
  }
  return wrong;
}

let db: AuthDb;

beforeAll(async () => {
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = `t10-bootstrap-bot:${FAKE_ENV_KEY}`;
  delete process.env.CRON_SECRET;
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    h.effects.push(`fetch ${String(url)}`);
    return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
  }));
  db = await createAuthDb("t10");
  h.pool = db.pool;
  const users = await db.pool.query(
    `INSERT INTO users (email, password_hash, role, tenant_id, is_active) VALUES
       ('owner@t10.test', 'x', 'owner', NULL, TRUE), ('inactive-owner@t10.test', 'x', 'owner', NULL, FALSE),
       ('admin@t10.test', 'x', 'admin', 'tenant-a', TRUE), ('operator@t10.test', 'x', 'operator', 'tenant-a', TRUE),
       ('viewer@t10.test', 'x', 'viewer', 'tenant-a', TRUE)
     RETURNING id, email`,
  );
  const id = (email: string) => users.rows.find((r) => r.email === email).id as number;
  const sessions: Array<[string, string, string]> = [
    ["owner@t10.test", "fake-t10-owner-session", "1 day"],
    ["owner@t10.test", "fake-t10-expired-owner-session", "-1 minute"],
    ["inactive-owner@t10.test", "fake-t10-inactive-owner-session", "1 day"],
    ["admin@t10.test", "fake-t10-admin-session", "1 day"],
    ["operator@t10.test", "fake-t10-operator-session", "1 day"],
    ["viewer@t10.test", "fake-t10-viewer-session", "1 day"],
  ];
  for (const [email, token, ttl] of sessions) {
    await db.pool.query("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + $3::interval)", [id(email), hash(token), ttl]);
  }
  await db.pool.query("INSERT INTO agents (id, token_hash, role, tenant_id) VALUES ('t10-agent', $1, 'agent', 'tenant-a'), ('t10-agent-admin', $2, 'admin', 'tenant-a')",
    [hash("fake-t10-agent-token"), hash("fake-t10-agent-admin-token")]);
  await db.pool.query("INSERT INTO api_keys (tenant_id, key_hash) VALUES ('tenant-a', $1)", [hash("ak_live_fake_t10_api_key")]);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  h.pool = null;
  await db?.drop();
});

describe("T10 the OWNER-ONLY table: 101 census rows, every exported handler and method (transformate WI-4498)", () => {
  it("the credential fixture itself: the owner session resolves owner, the inactive and the expired do not (real SQL)", async () => {
    const { resolveRequestCredential } = await import("@/lib/request-auth");
    const cookieReq = (t: string) => { const r = new NextRequest("https://arkon.test/api/x"); r.cookies.set("mc_auth", t); return r; };
    expect(await resolveRequestCredential(cookieReq("fake-t10-owner-session"))).toMatchObject({ type: "user_session", role: "owner" });
    expect(await resolveRequestCredential(cookieReq("fake-t10-inactive-owner-session"))).toBeNull();
    expect(await resolveRequestCredential(cookieReq("fake-t10-expired-owner-session"))).toBeNull();
  });

  it.each(OWNER_ONLY_ROWS.map((r) => [`${r.file}:${r.line} ${r.method}`, r] as const))("T10 %s", async (_name, row) => {
    expect(await driveRow(row)).toEqual([]);
  });

  it(`T10 ${CONTENT_FACTORY_GET.file}:${CONTENT_FACTORY_GET.line} GET (content-factory status, moved to the same check)`, async () => {
    expect(await driveRow(CONTENT_FACTORY_GET)).toEqual([]);
  });
});
