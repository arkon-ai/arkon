import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { checkAnomalies } from "@/lib/anomaly-detector";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/anomaly-detector", () => ({ checkAnomalies: vi.fn(async () => undefined), recomputeBaselines: vi.fn(async () => undefined) }));

const mockQuery = vi.mocked(query);
const mockCheck = vi.mocked(checkAnomalies);

/* THE CRON SECRET (transformate WI-5647). After the gate change in proxy.ts any Bearer POST to this path reaches the
   route, so the route's own secret check is the whole check: one helper (cron-secret.ts) that compares in constant
   time (constantTimeEqual) and refuses an unset, empty or whitespace secret and an empty provided value before any
   compare. Each T3b helper case imports the helper itself, so at the base (no helper) each case fails alone and the
   POST() cases still run. */
const RIGHT = "QZX5647MARK-cron-secret-1";
const OWNER_SESSION = "QZX5647MARK-FAKE-SESSION";
const JUNK = "QZX5647MARK-cron-secret-junk";
const ROUTE_401 = JSON.stringify({ error: "Cron secret or admin token required" });

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cronRequest(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  const req = new NextRequest("https://arkon.test/api/cron/baseline", { method: "POST", headers });
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

async function helper() {
  return (await import("./cron-secret")).cronSecretMatches;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = RIGHT;
  delete process.env.MC_ADMIN_TOKEN;
  process.env.MC_AGENT_TOKENS = "";
  // A platform owner session (role owner, tenant_id NULL): validateOwner admits it when it is the credential read.
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash(OWNER_SESSION)) {
      return { rows: [{ id: 1, email: "owner@example.test", role: "owner", tenant_id: null }] } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.restoreAllMocks();
});

describe("cronSecretMatches: the cron secret compare (transformate WI-5647 C2)", () => {
  it("T3b the right secret matches", async () => {
    expect((await helper())(RIGHT, RIGHT)).toBe(true);
  });

  it("T3b a wrong secret of the same length, a shorter one and a longer one do not match", async () => {
    const matches = await helper();
    const sameLength = "QZX5647MARK-cron-secret-2";
    expect(sameLength.length).toBe(RIGHT.length);
    expect(matches(sameLength, RIGHT)).toBe(false);
    expect(matches(RIGHT.slice(0, -1), RIGHT)).toBe(false);
    expect(matches(`${RIGHT}0`, RIGHT)).toBe(false);
  });

  it("T3b ('', '') does not match", async () => {
    expect((await helper())("", "")).toBe(false);
  });

  it("T3b ('', secret), (secret, '') and (null, secret) do not match", async () => {
    const matches = await helper();
    expect(matches("", RIGHT)).toBe(false);
    expect(matches(RIGHT, "")).toBe(false);
    expect(matches(null, RIGHT)).toBe(false);
  });

  it("T3b CRON_SECRET unset: nothing matches", async () => {
    const matches = await helper();
    delete process.env.CRON_SECRET;
    expect(matches(RIGHT)).toBe(false);
    expect(matches("")).toBe(false);
  });

  it("T3b CRON_SECRET whitespace only: not even the same whitespace matches", async () => {
    const matches = await helper();
    process.env.CRON_SECRET = "   ";
    expect(matches("   ")).toBe(false);
  });

  it("T3b CRON_SECRET set: the helper reads it at call time", async () => {
    const matches = await helper();
    expect(matches(RIGHT)).toBe(true);
    expect(matches(JUNK)).toBe(false);
  });

  it("T3b a multi-byte value of the same JS length but another byte length does not match and does not throw", async () => {
    const matches = await helper();
    const multi = `${RIGHT.slice(0, -1)}\u00e9`;
    expect(multi.length).toBe(RIGHT.length);
    expect(Buffer.byteLength(multi)).not.toBe(Buffer.byteLength(RIGHT));
    expect(() => matches(multi, RIGHT)).not.toThrow();
    expect(matches(multi, RIGHT)).toBe(false);
  });
});

describe("POST /api/cron/baseline: the route's own check (transformate WI-5647)", () => {
  it("T3b POST() with the right secret as a Bearer reaches the work: 200", async () => {
    const res = await POST(cronRequest({ authorization: `Bearer ${RIGHT}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, action: "check" });
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it("T3b POST() with a wrong secret as a Bearer: the route's 401", async () => {
    const res = await POST(cronRequest({ authorization: `Bearer ${JUNK}` }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(ROUTE_401);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("T3b POST() calls the helper once per request with a Bearer", async () => {
    const mod = await import("./cron-secret");
    const spy = vi.spyOn(mod, "cronSecretMatches");
    await POST(cronRequest({ authorization: `Bearer ${RIGHT}` }));
    expect(spy).toHaveBeenCalledTimes(1);
    // route.ts passes the Bearer value and its own CRON_SECRET read (:13).
    expect(spy).toHaveBeenLastCalledWith(RIGHT, RIGHT);
    await POST(cronRequest({ authorization: `Bearer ${JUNK}` }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(JUNK, RIGHT);
  });

  it("T7 a junk Bearer plus mc_auth = a valid owner session: the route's 401, only the Bearer was read", async () => {
    const res = await POST(cronRequest({ authorization: `Bearer ${JUNK}` }, { mc_auth: OWNER_SESSION }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(ROUTE_401);
    expect(mockCheck).not.toHaveBeenCalled();
    const seen = mockQuery.mock.calls.map((call) => (call[1] as unknown[] | undefined)?.[0]);
    expect(seen).toContain(hash(JUNK));
    expect(seen).not.toContain(hash(OWNER_SESSION));
    expect(seen).not.toContain(OWNER_SESSION);
  });

  it("T7 a junk Bearer plus mc_role=owner: the route's 401", async () => {
    const res = await POST(cronRequest({ authorization: `Bearer ${JUNK}` }, { mc_role: "owner" }));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(ROUTE_401);
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("T7 control: the same owner session cookie with no Bearer is the owner: 200 (so the refusals above are the Bearer's)", async () => {
    const res = await POST(cronRequest({}, { mc_auth: OWNER_SESSION }));
    expect(res.status).toBe(200);
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});
