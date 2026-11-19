import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import type pg from "pg";
import { createAuthDb, type AuthDb } from "@/lib/auth-test-db";
import { hashPassword } from "@/lib/password";
import { resolveRequestCredential } from "@/lib/request-auth";
import { POST as loginPOST } from "@/app/api/auth/login/route";

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
