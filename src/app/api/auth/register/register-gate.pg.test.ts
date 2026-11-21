import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import type pg from "pg";
import { createAuthDb, type AuthDb } from "@/lib/auth-test-db";
import { POST as registerPOST } from "@/app/api/auth/register/route";

/* THE REGISTER GATE on REAL PostgreSQL (transformate WI-4994). POST /api/auth/register admits ONLY the platform owner:
   the owner key by Bearer, or an active, unexpired session of a users row with role owner and tenant_id NULL. Every
   other caller gets 403 and zero users row before the body is read. For the platform owner, the body is held to the
   accepted set: anything else gets 400 and zero users row. The session-road pattern (session-road.pg.test.ts): every
   statement that names only the credential tables (users, user_sessions, tenants, api_keys, agents) runs for real on a
   private database of the throwaway cluster (src/lib/auth-test-db.ts); any other statement (the audit row) is recorded
   and answered with zero rows. Every case asserts the status AND the users row count before and after; a 201 case also
   reads the stored role and tenant_id back. Fixed FAKE values only, each carrying the marker QZX4994MARK. */

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

const FAKE_OWNER_KEY = "QZX4994MARK-FAKE-OWNER-KEY";
const FAKE_AGENT_TOKEN = "QZX4994MARK-FAKE-AGENT-TOKEN";
// request-auth.ts resolves an api key only in its ak_live_ form, so the fake key carries that prefix.
const FAKE_API_KEY = "ak_live_QZX4994MARK-FAKE-API-KEY";
// The seeded rows never sign in: their password_hash is a fixed marker string, never a hash of anything.
const FAKE_HASH_COLUMN = "QZX4994MARK-fake-password-hash-column";

const SESSION = {
  platformOwner: "QZX4994MARK-session-platform-owner",
  expiredPlatformOwner: "QZX4994MARK-session-platform-owner-expired",
  boundOwner: "QZX4994MARK-session-bound-owner-tenant-a",
  emptyTenantOwner: "QZX4994MARK-session-owner-empty-tenant",
  admin: "QZX4994MARK-session-admin",
  operator: "QZX4994MARK-session-operator",
  viewer: "QZX4994MARK-session-viewer",
  tenantUser: "QZX4994MARK-session-tenant-user",
} as const;

interface Caller {
  bearer?: string;
  cookie?: string;
}

const CALLER: Record<string, Caller> = {
  "owner-key": { bearer: FAKE_OWNER_KEY },
  "platform-owner-session": { cookie: SESSION.platformOwner },
  "expired-platform-owner-session": { cookie: SESSION.expiredPlatformOwner },
  "bound-owner-session": { cookie: SESSION.boundOwner },
  "empty-tenant-owner-session": { cookie: SESSION.emptyTenantOwner },
  "admin-session": { cookie: SESSION.admin },
  "operator-session": { cookie: SESSION.operator },
  "viewer-session": { cookie: SESSION.viewer },
  "tenant-user-session": { cookie: SESSION.tenantUser },
  "agent-token": { bearer: FAKE_AGENT_TOKEN },
  "api-key": { bearer: FAKE_API_KEY },
  "owner-key-by-cookie": { cookie: FAKE_OWNER_KEY },
  "no-credential": {},
};

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

let serial = 100;
/** A fresh synthetic account for one case: email qzx4994mark-<n>@example.test, password Qzx4994Mark!pw<n>. */
function account(): { email: string; password: string } {
  serial += 1;
  return { email: `qzx4994mark-${serial}@example.test`, password: `Qzx4994Mark!pw${serial}` };
}

function registerReq(caller: Caller, rawBody: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (caller.bearer) headers.authorization = `Bearer ${caller.bearer}`;
  const req = new NextRequest("https://arkon.test/api/auth/register", { method: "POST", headers, body: rawBody });
  if (caller.cookie) req.cookies.set("mc_auth", caller.cookie);
  return req;
}

async function usersCount(): Promise<number> {
  const r = await db.pool.query("SELECT count(*)::int AS n FROM users");
  return r.rows[0].n as number;
}

/** POSTs rawBody as caller; returns the status, the error text (if any) and the users count before and after. */
async function post(caller: Caller, rawBody: string) {
  const before = await usersCount();
  const res = await registerPOST(registerReq(caller, rawBody));
  const after = await usersCount();
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return { status: res.status, error: json?.error, before, after };
}

let db: AuthDb;

beforeAll(async () => {
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = "";
  db = await createAuthDb("wi4994_register_gate");
  h.pool = db.pool;
  // auth-test-db.ts seeds 'tenant-a'. This file adds 'tenant-b' (another tenant) and a tenants row with id "": the
  // users table refuses tenant_id "" without it (users.tenant_id REFERENCES tenants(id)).
  await db.pool.query(
    "INSERT INTO tenants (id, name) VALUES ('tenant-b', 'QZX4994MARK Tenant B'), ('', 'QZX4994MARK empty id tenant')",
  );
  const users: Array<[string, string, string | null, string]> = [
    ["qzx4994mark-1@example.test", "owner", null, SESSION.platformOwner],
    ["qzx4994mark-2@example.test", "owner", "tenant-a", SESSION.boundOwner],
    ["qzx4994mark-3@example.test", "owner", "", SESSION.emptyTenantOwner],
    ["qzx4994mark-4@example.test", "admin", null, SESSION.admin],
    ["qzx4994mark-5@example.test", "operator", null, SESSION.operator],
    ["qzx4994mark-6@example.test", "viewer", null, SESSION.viewer],
    ["qzx4994mark-7@example.test", "tenant_user", "tenant-a", SESSION.tenantUser],
  ];
  for (const [email, role, tenantId, session] of users) {
    const u = await db.pool.query(
      "INSERT INTO users (email, password_hash, display_name, role, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [email, FAKE_HASH_COLUMN, `QZX4994MARK ${role}`, role, tenantId],
    );
    await db.pool.query(
      "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day')",
      [u.rows[0].id, hash(session)],
    );
  }
  // An EXPIRED session of the platform owner row (qzx4994mark-1).
  await db.pool.query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
       SELECT id, $1, NOW() - INTERVAL '1 hour' FROM users WHERE email = 'qzx4994mark-1@example.test'`,
    [hash(SESSION.expiredPlatformOwner)],
  );
  // An agents row whose role reads owner (request-auth.ts downgrades it to agent) and an api key of tenant-a.
  await db.pool.query(
    "INSERT INTO agents (id, name, token_hash, role, tenant_id) VALUES ('qzx4994mark-agent-1', 'QZX4994MARK agent', $1, 'owner', NULL)",
    [hash(FAKE_AGENT_TOKEN)],
  );
  await db.pool.query(
    "INSERT INTO api_keys (tenant_id, name, key_hash) VALUES ('tenant-a', 'QZX4994MARK api key', $1)",
    [hash(FAKE_API_KEY)],
  );
});

afterAll(async () => {
  h.pool = null;
  await db?.drop();
});

// ── R201: the platform owner creates every listed role in every tenant form ──────────────────────────────────────

type TenantForm = { label: string; field: Record<string, unknown>; stored: string | null };
const TENANT_FORMS: TenantForm[] = [
  { label: "absent", field: {}, stored: null },
  { label: "null", field: { tenant_id: null }, stored: null },
  { label: "tenant-a", field: { tenant_id: "tenant-a" }, stored: "tenant-a" },
];
const ROLE_FORMS: Array<{ label: string; field: Record<string, unknown>; stored: string }> = [
  { label: "absent", field: {}, stored: "viewer" },
  { label: "owner", field: { role: "owner" }, stored: "owner" },
  { label: "admin", field: { role: "admin" }, stored: "admin" },
  { label: "operator", field: { role: "operator" }, stored: "operator" },
  { label: "viewer", field: { role: "viewer" }, stored: "viewer" },
];

interface R201Case {
  id: string;
  caller: Caller;
  extra: Record<string, unknown>;
  role: string;
  tenant: string | null;
  displayName: string | null;
}

const R201: R201Case[] = [];
for (const callerId of ["owner-key", "platform-owner-session"]) {
  for (const r of ROLE_FORMS) {
    for (const t of TENANT_FORMS) {
      const displayName = t.stored === null ? null : `QZX4994MARK display ${callerId} ${r.label}`;
      R201.push({
        id: `R201-${callerId}-role-${r.label}-tenant-${t.label}`,
        caller: CALLER[callerId],
        extra: { ...r.field, ...t.field, ...(displayName === null ? {} : { display_name: displayName }) },
        role: r.stored,
        tenant: t.stored,
        displayName,
      });
    }
  }
  R201.push({
    id: `R201-${callerId}-role-tenant_user-tenant-tenant-a`,
    caller: CALLER[callerId],
    extra: { role: "tenant_user", tenant_id: "tenant-a" },
    role: "tenant_user",
    tenant: "tenant-a",
    displayName: null,
  });
}

describe("R201: the platform owner (owner key by Bearer, or an owner session with tenant_id NULL) registers (transformate WI-4994)", () => {
  for (const c of R201) {
    it(`${c.id}: 201, one new users row, role and tenant_id stored as asked`, async () => {
      const acct = account();
      const got = await post(c.caller, JSON.stringify({ ...acct, ...c.extra }));
      expect(got.status, c.id).toBe(201);
      expect(got.after, `${c.id} users count`).toBe(got.before + 1);
      const row = await db.pool.query("SELECT role, tenant_id, display_name FROM users WHERE email = $1", [acct.email]);
      expect(row.rows, c.id).toEqual([{ role: c.role, tenant_id: c.tenant, display_name: c.displayName }]);
    });
  }
});

// ── R403: every caller other than the platform owner, refused before the body is read ───────────────────────────

interface RefusalCase {
  id: string;
  caller: Caller;
  body: () => string;
}

const asBody = (fields: Record<string, unknown>) => () => JSON.stringify({ ...account(), ...fields });

const R403: RefusalCase[] = [
  // THE FAULT (ADJUDICATION-u5-1 section 5 REPRO 3): a tenant-bound owner made an owner with tenant_id NULL.
  { id: "R403-FAULT-bound-owner-role-owner-tenant-absent", caller: CALLER["bound-owner-session"], body: asBody({ role: "owner" }) },
  { id: "R403-bound-owner-role-absent-tenant-absent", caller: CALLER["bound-owner-session"], body: asBody({}) },
  { id: "R403-bound-owner-role-owner-tenant-null", caller: CALLER["bound-owner-session"], body: asBody({ role: "owner", tenant_id: null }) },
  ...["owner", "admin", "operator", "viewer", "tenant_user"].flatMap((role) => [
    // N1: another tenant.
    { id: `R403-bound-owner-role-${role}-tenant-b-other-tenant`, caller: CALLER["bound-owner-session"], body: asBody({ role, tenant_id: "tenant-b" }) },
    // Its own tenant: register is platform-owner only (the owner's pick, skeptic A1).
    { id: `R403-bound-owner-role-${role}-tenant-a-own-tenant`, caller: CALLER["bound-owner-session"], body: asBody({ role, tenant_id: "tenant-a" }) },
  ]),
  // A users row with tenant_id "" is tenant-bound, not the platform owner.
  { id: "R403-FAULT-empty-tenant-owner-role-owner-tenant-absent", caller: CALLER["empty-tenant-owner-session"], body: asBody({ role: "owner" }) },
  { id: "R403-empty-tenant-owner-role-viewer-tenant-a", caller: CALLER["empty-tenant-owner-session"], body: asBody({ role: "viewer", tenant_id: "tenant-a" }) },
  { id: "R403-admin-session-role-owner-tenant-absent", caller: CALLER["admin-session"], body: asBody({ role: "owner" }) },
  { id: "R403-admin-session-role-viewer-tenant-a", caller: CALLER["admin-session"], body: asBody({ role: "viewer", tenant_id: "tenant-a" }) },
  { id: "R403-operator-session-role-owner-tenant-absent", caller: CALLER["operator-session"], body: asBody({ role: "owner" }) },
  { id: "R403-viewer-session-role-owner-tenant-absent", caller: CALLER["viewer-session"], body: asBody({ role: "owner" }) },
  { id: "R403-tenant-user-session-role-owner-tenant-absent", caller: CALLER["tenant-user-session"], body: asBody({ role: "owner" }) },
  { id: "R403-expired-platform-owner-session", caller: CALLER["expired-platform-owner-session"], body: asBody({ role: "owner" }) },
  { id: "R403-agent-token-agents-row-role-owner", caller: CALLER["agent-token"], body: asBody({ role: "owner" }) },
  { id: "R403-api-key", caller: CALLER["api-key"], body: asBody({ role: "owner" }) },
  { id: "R403-owner-key-by-cookie", caller: CALLER["owner-key-by-cookie"], body: asBody({ role: "owner" }) },
  { id: "R403-no-credential", caller: CALLER["no-credential"], body: asBody({ role: "owner" }) },
  // THE BODY-NOT-READ cases: a body that is not JSON gets 403 (not 400 or 500), so the gate ran before any parse.
  { id: "R403-BODY-NOT-READ-bound-owner-non-json-body", caller: CALLER["bound-owner-session"], body: () => "QZX4994MARK not json {" },
  { id: "R403-BODY-NOT-READ-no-credential-non-json-body", caller: CALLER["no-credential"], body: () => "QZX4994MARK not json {" },
];

describe("R403: every other caller gets 403 and zero users row, before the body is read (transformate WI-4994)", () => {
  for (const c of R403) {
    it(`${c.id}: 403, users count unchanged`, async () => {
      const got = await post(c.caller, c.body());
      expect(got.status, c.id).toBe(403);
      expect(got.error, c.id).toBe("Owner access required");
      expect(got.after, `${c.id} users count`).toBe(got.before);
    });
  }
});

// ── R400: the platform owner, a body outside the accepted set ───────────────────────────────────────────────────

const R400_BODIES: Array<{ id: string; body: () => string }> = [
  { id: "tenant-id-empty-string", body: asBody({ role: "viewer", tenant_id: "" }) },
  { id: "tenant-id-star", body: asBody({ role: "viewer", tenant_id: "*" }) },
  { id: "tenant-id-number-5", body: asBody({ role: "viewer", tenant_id: 5 }) },
  { id: "tenant-id-true", body: asBody({ role: "viewer", tenant_id: true }) },
  { id: "tenant-id-object", body: asBody({ role: "viewer", tenant_id: { id: "tenant-a" } }) },
  { id: "tenant-id-array", body: asBody({ role: "viewer", tenant_id: ["tenant-a"] }) },
  { id: "tenant-id-tenant-zzz-no-tenants-row", body: asBody({ role: "viewer", tenant_id: "tenant-zzz" }) },
  { id: "role-number-5", body: asBody({ role: 5 }) },
  { id: "role-null", body: asBody({ role: null }) },
  { id: "role-unknown-superadmin", body: asBody({ role: "superadmin" }) },
  { id: "display-name-number-5", body: asBody({ display_name: 5 }) },
  { id: "display-name-null", body: asBody({ display_name: null }) },
  { id: "tenant_user-tenant-id-absent", body: asBody({ role: "tenant_user" }) },
  { id: "tenant_user-tenant-id-null", body: asBody({ role: "tenant_user", tenant_id: null }) },
  { id: "extra-field", body: asBody({ role: "viewer", is_active: true }) },
  { id: "email-absent", body: () => JSON.stringify({ password: account().password, role: "viewer" }) },
  { id: "email-number", body: () => JSON.stringify({ email: 5, password: account().password }) },
  { id: "email-bad-format", body: () => JSON.stringify({ email: "qzx4994mark not an email", password: account().password }) },
  { id: "password-weak", body: () => JSON.stringify({ email: account().email, password: "qzx4994mark" }) },
  { id: "password-number", body: () => JSON.stringify({ email: account().email, password: 49944994499 }) },
  { id: "body-array", body: () => JSON.stringify([account()]) },
  { id: "body-string", body: () => JSON.stringify("QZX4994MARK") },
  { id: "body-number", body: () => JSON.stringify(4994) },
  { id: "body-json-null", body: () => "null" },
  { id: "body-not-json", body: () => "QZX4994MARK not json {" },
  { id: "body-empty", body: () => "" },
];

const R400: RefusalCase[] = ["owner-key", "platform-owner-session"].flatMap((callerId) =>
  R400_BODIES.map((b) => ({ id: `R400-${callerId}-${b.id}`, caller: CALLER[callerId], body: b.body })),
);

describe("R400: the platform owner with a body outside the accepted set gets 400 and zero users row (transformate WI-4994)", () => {
  for (const c of R400) {
    it(`${c.id}: 400, users count unchanged`, async () => {
      const got = await post(c.caller, c.body());
      expect(got.status, c.id).toBe(400);
      expect(typeof got.error, c.id).toBe("string");
      expect(got.after, `${c.id} users count`).toBe(got.before);
    });
  }
});
