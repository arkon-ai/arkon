import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import type pg from "pg";
import { createAuthDb, type AuthDb } from "@/lib/auth-test-db";
import { hashPassword } from "@/lib/password";
import { resolveRequestCredential } from "@/lib/request-auth";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as verifyMagicPOST } from "@/app/api/auth/verify-magic-link/route";
import { proxy } from "@/proxy";

/* THE OWNER SESSION ROAD on REAL PostgreSQL (the U5 sign-in set, transformate WI-4492 T3; S3, S5). The auth routes,
   proxy.ts and request-auth.ts run unmocked against a private database on the throwaway cluster (src/lib/auth-test-db.ts):
   every statement that names only the credential tables runs for real; any other statement (the audit row, a route's own
   reads and writes) is recorded and answered with zero rows. Fixed FAKE values only. */

const h = vi.hoisted(() => ({ pool: null as pg.Pool | null, stubbed: [] as string[] }));
vi.mock("@/lib/db", async () => {
  const { touchesOnlyAuthTables } = await import("@/lib/auth-test-db");
  const query = vi.fn(async (text: string, params?: unknown[]) => {
    if (h.pool && touchesOnlyAuthTables(text)) return h.pool.query(text, params);
    h.stubbed.push(text);
    return { rows: [], rowCount: 0 };
  });
  return { query, default: { query }, withTransaction: vi.fn() };
});

const FAKE_OWNER_KEY = "fake-u5-owner-key-0000000000000000";
const FAKE_PASSWORD = "Fake-U5-Owner-Passw0rd";
const OWNER_EMAIL = "owner@example.test";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

function jsonReq(path: string, body: unknown, init: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const req = new NextRequest(`https://arkon.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });
  for (const [k, v] of Object.entries(init.cookies ?? {})) req.cookies.set(k, v);
  return req;
}

function cookieReq(path: string, cookies: Record<string, string>, init: { method?: string; headers?: Record<string, string> } = {}) {
  const req = new NextRequest(`https://arkon.test${path}`, { method: init.method ?? "GET", headers: init.headers });
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

/** The value a Set-Cookie of the answer gives the cookie `name` (null when the answer sets none). */
function setCookieValue(res: Response, name: string): string | null {
  const row = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.slice(name.length + 1).split(";")[0]) : null;
}

let db: AuthDb;

beforeAll(async () => {
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = "";
  db = await createAuthDb("session_road");
  h.pool = db.pool;
  const pw = await hashPassword(FAKE_PASSWORD);
  await db.pool.query(
    `INSERT INTO users (email, password_hash, role, tenant_id, is_active) VALUES
       ($1, $2, 'owner', NULL, TRUE), ('inactive-owner@example.test', $2, 'owner', NULL, FALSE),
       ('admin@example.test', $2, 'admin', 'tenant-a', TRUE)`,
    [OWNER_EMAIL, pw],
  );
});

afterAll(async () => {
  h.pool = null;
  await db?.drop();
});

describe("the owner session road: /api/auth/login, never init (transformate WI-4492 T3, S5)", () => {
  // GREEN at the base by design (S10, positive control, named): /api/auth/login already made owner sessions.
  it("T3 a session sign-in by /api/auth/login for a users role owner row sets mc_auth to the session token and resolves role owner", async () => {
    const res = await loginPOST(jsonReq("/api/auth/login", { email: OWNER_EMAIL, password: FAKE_PASSWORD }));
    expect(res.status).toBe(200);
    const session = setCookieValue(res, "mc_auth");
    expect(session).toMatch(/^[0-9a-f]{64}$/);
    expect(session).not.toBe(FAKE_OWNER_KEY);
    const row = await db.pool.query(
      "SELECT u.email, u.role FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1",
      [hash(session!)],
    );
    expect(row.rows).toEqual([{ email: OWNER_EMAIL, role: "owner" }]);
    const cred = await resolveRequestCredential(cookieReq("/api/x", { mc_auth: session! }));
    expect(cred).toMatchObject({ type: "user_session", role: "owner", tenant_id: null, email: OWNER_EMAIL });
  });
});

describe("both login pages end to end through proxy and handlers (transformate WI-4493, S4, S10)", () => {
  /** What the page does: its request goes through proxy.ts first (which reads no body), then the route handler. */
  async function throughProxy(req: NextRequest, handler: (r: NextRequest) => Promise<Response>) {
    const gate = await proxy(req);
    if (gate.status !== 200 || gate.headers.get("location")) return gate;
    return handler(req);
  }

  // GREEN at the base by design (S10, positive control, named): the password road existed; /login did not mount it
  // (the page itself is pinned RED-at-base in src/app/login/login-page.test.ts).
  it("password: /api/auth/login passes the proxy with no credential and no CSRF token, and its session opens a protected page", async () => {
    const res = await throughProxy(jsonReq("/api/auth/login", { email: OWNER_EMAIL, password: FAKE_PASSWORD }), loginPOST);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, role: "owner" });
    const session = setCookieValue(res, "mc_auth")!;
    const page = await proxy(cookieReq("/", { mc_auth: session }));
    expect(page.status).toBe(200);
    expect(page.headers.get("location")).toBeNull();
    const bare = await proxy(cookieReq("/", {}));
    expect(bare.headers.get("location")).toBe("https://arkon.test/login");
  });

  // GREEN at the base by design (S10, positive control, named): verify-magic-link already made owner sessions. The
  // mail is mocked: the test writes the magic_link_tokens row the link would carry.
  it("magic link: a mocked magic-link session through proxy and handlers signs the owner in and opens a protected page", async () => {
    const linkToken = "fake-u5-magic-link-token-5555";
    await db.pool.query("INSERT INTO magic_link_tokens (email, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')", [OWNER_EMAIL, hash(linkToken)]);
    const res = await throughProxy(jsonReq("/api/auth/verify-magic-link", { token: linkToken, email: OWNER_EMAIL }), verifyMagicPOST);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, role: "owner" });
    const session = setCookieValue(res, "mc_auth")!;
    expect((await resolveRequestCredential(cookieReq("/api/x", { mc_auth: session })))?.role).toBe("owner");
    const page = await proxy(cookieReq("/", { mc_auth: session }));
    expect(page.status).toBe(200);
    expect(page.headers.get("location")).toBeNull();
  });

  // GREEN at the base by design (S10, named): login already refused an inactive users row.
  it("an inactive owner row cannot sign in by password (403 Account disabled, zero cookie)", async () => {
    const res = await throughProxy(jsonReq("/api/auth/login", { email: "inactive-owner@example.test", password: FAKE_PASSWORD }), loginPOST);
    expect(res.status).toBe(403);
    expect(setCookieValue(res, "mc_auth")).toBeNull();
  });
});
