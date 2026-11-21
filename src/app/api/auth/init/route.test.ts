import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

// Fixed FAKE values (S10): none of them is, or was ever, a real key.
const FAKE_OWNER_KEY = "fake-u5-owner-key-0000000000000000";
const FAKE_ENV_AGENT_KEY = "fake-u5-env-agent-key-1111";
const FAKE_AGENT_TABLE_TOKEN = "fake-u5-agent-table-token-2222";
const FAKE_API_KEY = "ak_live_fake_u5_api_key_3333";
const FAKE_OWNER_SESSION = "fake-u5-owner-session-4444";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

function postReq(bearer?: string, cookies: Record<string, string> = {}) {
  const init: { method: string; headers?: Record<string, string> } = { method: "POST" };
  if (bearer !== undefined) init.headers = { authorization: `Bearer ${bearer}` };
  const req = new NextRequest("https://arkon.test/api/auth/init", init);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

/** Every Set-Cookie the answer carries (zero is the rule for every init answer, transformate WI-4492 S5). */
function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = `fake-u5-agent:${FAKE_ENV_AGENT_KEY}`;
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const h = params?.[0];
    if (sql.includes("JOIN user_sessions") && h === hash(FAKE_OWNER_SESSION)) {
      return { rows: [{ id: 1, email: "owner@example.test", role: "owner", tenant_id: null }] } as never;
    }
    if (sql.includes("FROM api_keys") && h === hash(FAKE_API_KEY)) return { rows: [{ id: 7, tenant_id: "tenant-a" }] } as never;
    if (sql.includes("FROM agents WHERE token_hash") && h === hash(FAKE_AGENT_TABLE_TOKEN)) {
      return { rows: [{ id: "agent-x", role: "agent", tenant_id: "tenant-a" }] } as never;
    }
    return { rows: [] } as never;
  });
});

describe("POST /api/auth/init owner elevation (WI-1346 #5), retired by transformate WI-4492", () => {
  // FLIPPED (transformate WI-4492): was "grants owner on an exact admin-token match". Init has no positive path
  // left, so the exact owner key gets the retired answer; the WI-1346 #5 compare is pinned in request-auth.test.ts.
  it("an exact owner-key match answers 410 init_retired, never owner (was: grants owner)", async () => {
    process.env.MC_ADMIN_TOKEN = "a".repeat(80);
    const res = await POST(postReq("a".repeat(80)));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "init_retired" });
  });

  // FLIPPED (transformate WI-4492): was "does NOT grant owner for a token sharing the admin token's first 64 chars"
  // (401). A presented Bearer of any value now gets the one retired answer, so init is no oracle for a key.
  it("a token sharing the admin token's first 64 chars gets the same 410 as any key, never owner", async () => {
    const prefix = "a".repeat(64);
    process.env.MC_ADMIN_TOKEN = `${prefix}XXXXXXXXXXXXXXXX`;
    const res = await POST(postReq(`${prefix}YYYYYYYYYYYYYYYY`));
    expect(res.status).toBe(410);
    expect(setCookies(res)).toEqual([]);
  });
});

describe("POST /api/auth/init is retired: 410 with any credential, 401 with none, zero Set-Cookie (transformate WI-4492 S5)", () => {
  it("T1 the fake owner key answers 410 init_retired and sets zero cookie", async () => {
    const res = await POST(postReq(FAKE_OWNER_KEY));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "init_retired" });
    expect(setCookies(res)).toEqual([]);
  });

  it("T2 an agents-table token answers 410 and sets zero cookie", async () => {
    const res = await POST(postReq(FAKE_AGENT_TABLE_TOKEN));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "init_retired" });
    expect(setCookies(res)).toEqual([]);
  });

  it("T2 an MC_AGENT_TOKENS env agent key answers 410 and sets zero cookie", async () => {
    const res = await POST(postReq(FAKE_ENV_AGENT_KEY));
    expect(res.status).toBe(410);
    expect(setCookies(res)).toEqual([]);
  });

  it("T2 an ak_live_ api key answers 410 and sets zero cookie", async () => {
    const res = await POST(postReq(FAKE_API_KEY));
    expect(res.status).toBe(410);
    expect(setCookies(res)).toEqual([]);
  });

  it("T2 a user session token sent as a Bearer answers 410 and sets zero cookie (the session road is /api/auth/login)", async () => {
    const res = await POST(postReq(FAKE_OWNER_SESSION));
    expect(res.status).toBe(410);
    expect(setCookies(res)).toEqual([]);
  });

  it("a junk Bearer gets the same 410 as a valid key (init answers no key check)", async () => {
    const res = await POST(postReq("junk-not-a-key"));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "init_retired" });
    expect(setCookies(res)).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // GREEN at the base by design (S10, named): the base already answered 401 to a request with no Bearer.
  it("no credential answers 401 and sets zero cookie", async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(401);
    expect(setCookies(res)).toEqual([]);
  });

  // GREEN at the base by design (S10, named): init never read a cookie; an mc_auth cookie alone is no credential.
  it("an mc_auth cookie with no Bearer answers 401 and sets zero cookie", async () => {
    const res = await POST(postReq(undefined, { mc_auth: FAKE_OWNER_SESSION }));
    expect(res.status).toBe(401);
    expect(setCookies(res)).toEqual([]);
  });
});
