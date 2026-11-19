import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { resolveRequestCredential } from "./request-auth";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function req(opts: { bearer?: string; cookies?: Record<string, string> }) {
  const headers = opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : undefined;
  const r = new NextRequest("https://arkon.test/api/x", headers ? { headers } : undefined);
  for (const [k, v] of Object.entries(opts.cookies ?? {})) r.cookies.set(k, v);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
});

describe("resolveRequestCredential", () => {
  it("maps a tenant_user session to the viewer role", async () => {
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("sess")) {
        return { rows: [{ id: 3, email: "u@t.test", role: "tenant_user", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ cookies: { mc_auth: "sess" } }));
    expect(cred?.type).toBe("user_session");
    expect(cred?.role).toBe("viewer");
    expect(cred?.tenant_id).toBe("tenant-a");
  });

  it("resolves MC_ADMIN_TOKEN to an owner credential with wildcard tenant", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const cred = await resolveRequestCredential(req({ bearer: "owner-secret" }));
    expect(cred?.role).toBe("owner");
    expect(cred?.tenant_id).toBe("*");
  });

  // Pins the constantTimeEqual sha256 fix (WI-1346 finding #5): a long token
  // sharing the admin token's first 64 chars must NOT authenticate as owner.
  it("does NOT accept a long token sharing the admin token's first 64 characters", async () => {
    const prefix = "a".repeat(64);
    process.env.MC_ADMIN_TOKEN = `${prefix}X`;
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const cred = await resolveRequestCredential(req({ bearer: `${prefix}Y` }));
    expect(cred).toBeNull();
  });

  // Pins the agent-token role clamp (WI-1346 finding #6): an agent token must
  // never resolve to the fleet-owner role.
  it("downgrades an agent token whose row says 'owner' to the agent role", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM agents WHERE token_hash")) {
        return { rows: [{ id: "agent-x", role: "owner", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ bearer: "agent-bearer" }));
    expect(cred?.type).toBe("agent_token");
    expect(cred?.role).toBe("agent"); // never fleet-owner via an agent token
  });

  it("passes an owner-provisioned tenant-scoped agent role (admin) through unchanged", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM agents WHERE token_hash")) {
        return { rows: [{ id: "agent-y", role: "admin", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ bearer: "agent-bearer-2" }));
    expect(cred?.role).toBe("admin"); // contained by per-tenant route gates (WI-1346 #1)
  });

  it("accepts an ak_live_ api key as an agent credential bound to its tenant", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM api_keys")) {
        return { rows: [{ id: 11, tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ bearer: "ak_live_abc123" }));
    expect(cred?.type).toBe("api_key");
    expect(cred?.role).toBe("agent");
    expect(cred?.tenant_id).toBe("tenant-a");
  });

  it("an unknown bearer with no session/admin/agent match resolves to null", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const cred = await resolveRequestCredential(req({ bearer: "totally-unknown" }));
    expect(cred).toBeNull();
  });
});

/* THE COOKIE RULE (transformate WI-4495, S7): every key compare takes the key from the Bearer header ONLY. A cookie
   resolves a user session and an ak_live_ key (kept, named: its removal is W03 U6); an agents-table token by cookie
   is refused; the owner key and an MC_AGENT_TOKENS pair by cookie resolve nothing. Fixed FAKE values only. */
describe("resolveRequestCredential: key compares by Bearer only (transformate WI-4495)", () => {
  const FAKE_ENV_KEY = "FAKE-envkey-q7x2m9w4p8";
  const FAKE_AGENT_TABLE_TOKEN = "fake-u5-agent-table-token-2222";

  beforeEach(() => {
    process.env.MC_AGENT_TOKENS = `bootstrap-bot:${FAKE_ENV_KEY}`;
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      const h = (params as unknown[])?.[0];
      if (String(sql).includes("JOIN user_sessions") && h === hash("owner-session")) {
        return { rows: [{ id: 1, email: "owner@example.test", role: "owner", tenant_id: null }] } as never;
      }
      if (String(sql).includes("FROM api_keys") && h === hash("ak_live_fake_cookie_key")) return { rows: [{ id: 5, tenant_id: "tenant-a" }] } as never;
      if (String(sql).includes("FROM agents WHERE token_hash") && h === hash(FAKE_AGENT_TABLE_TOKEN)) {
        return { rows: [{ id: "agent-t", role: "admin", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
  });

  it("T1b the fake owner key in the mc_auth cookie resolves nothing", async () => {
    expect(await resolveRequestCredential(req({ cookies: { mc_auth: "owner-secret" } }))).toBeNull();
  });

  // GREEN at the base by design (S10, positive control): the owner key stays a server credential by Bearer.
  it("T1b the same fake owner key as a Bearer still resolves owner", async () => {
    expect(await resolveRequestCredential(req({ bearer: "owner-secret" }))).toMatchObject({ type: "owner_token", role: "owner" });
  });

  it("T1b a fake MC_AGENT_TOKENS key in the mc_auth cookie resolves nothing", async () => {
    expect(await resolveRequestCredential(req({ cookies: { mc_auth: FAKE_ENV_KEY } }))).toBeNull();
  });

  // GREEN at the base by design (S10, positive control).
  it("T1b the same fake MC_AGENT_TOKENS key as a Bearer still resolves the agent", async () => {
    expect(await resolveRequestCredential(req({ bearer: FAKE_ENV_KEY }))).toMatchObject({ type: "agent_token", role: "agent", agent_id: "bootstrap-bot" });
  });

  it("an agents-table token in the mc_auth cookie is refused", async () => {
    expect(await resolveRequestCredential(req({ cookies: { mc_auth: FAKE_AGENT_TABLE_TOKEN } }))).toBeNull();
  });

  // GREEN at the base by design (S10, positive control).
  it("an agents-table token as a Bearer still resolves", async () => {
    expect(await resolveRequestCredential(req({ bearer: FAKE_AGENT_TABLE_TOKEN }))).toMatchObject({ type: "agent_token", agent_id: "agent-t" });
  });

  // GREEN at the base by design (S10, kept and named): a cookie resolves a user session.
  it("a user session in the mc_auth cookie still resolves (kept)", async () => {
    expect(await resolveRequestCredential(req({ cookies: { mc_auth: "owner-session" } }))).toMatchObject({ type: "user_session", role: "owner" });
  });

  // GREEN at the base by design (S10, kept and named: the ak_live_ cookie read stays; its removal is W03 U6).
  it("an ak_live_ key in the mc_auth cookie still resolves (kept, W03 U6)", async () => {
    expect(await resolveRequestCredential(req({ cookies: { mc_auth: "ak_live_fake_cookie_key" } }))).toMatchObject({ type: "api_key", tenant_id: "tenant-a" });
  });

  // GREEN at the base by design (S10, named): Bearer precedence (request-auth.ts:124-130, proxy.ts:146).
  it("a junk Bearer with a valid owner session cookie resolves the Bearer path only: nothing", async () => {
    expect(await resolveRequestCredential(req({ bearer: "junk-bearer", cookies: { mc_auth: "owner-session" } }))).toBeNull();
  });
});

/** True when any console row holds the key, its sha256, or any 6-byte window of it (zero byte of the key). */
function leaksKey(rows: string[], key: string): boolean {
  const all = rows.join("\n");
  if (all.includes(hash(key))) return true;
  for (let i = 0; i + 6 <= key.length; i++) if (all.includes(key.slice(i, i + 6))) return true;
  return false;
}

function captureConsole() {
  const rows: string[] = [];
  const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { rows.push(args.map(String).join(" ")); }));
  return { rows, restore: () => spies.forEach((s) => s.mockRestore()) };
}

describe("T6 an MC_AGENT_TOKENS hit logs the agent id and zero byte of the key (transformate WI-4495)", () => {
  const FAKE_ENV_KEY = "FAKE-envkey-q7x2m9w4p8";

  it("T6 request-auth: one warning row names the agent id, zero byte of the key", async () => {
    process.env.MC_AGENT_TOKENS = `bootstrap-bot:${FAKE_ENV_KEY}`;
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const out = captureConsole();
    try {
      expect(await resolveRequestCredential(req({ bearer: FAKE_ENV_KEY }))).toMatchObject({ agent_id: "bootstrap-bot" });
    } finally {
      out.restore();
    }
    const hits = out.rows.filter((r) => r.includes("bootstrap-bot"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/\[auth-legacy\]/);
    expect(leaksKey(out.rows, FAKE_ENV_KEY)).toBe(false);
  });
});
