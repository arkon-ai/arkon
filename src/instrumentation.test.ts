import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";

/* T5, THE BOOT ROWS (transformate WI-4496, S9 (c)): register() logs ONE row per legacy auth path, armed or off:
     [auth-legacy] arkon MC_ADMIN_TOKEN browser path: armed|off
     [auth-legacy] arkon MC_ADMIN_TOKEN server path: armed|off
     [auth-legacy] arkon MC_AGENT_TOKENS env agent path: armed|off
   The server and env rows read armed/off from the env; the browser row reports the ACTUAL auth behaviour of the
   built code (does init set an mc_auth cookie for the key, does the key carried in mc_auth resolve owner), never a
   fixed string. Zero value, zero hash, zero count of pairs, zero agent id in any row. Fixed FAKE values only. */

vi.mock("@/lib/db", () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock("@/lib/workflow-scheduler", () => ({ startScheduler: vi.fn() }));
vi.mock("@/lib/active-runs", () => ({ hydrateFromDb: vi.fn().mockResolvedValue(undefined) }));

const FAKE_OWNER_KEY = "fake-u5-boot-owner-key-0000000000";
const FAKE_ENV_KEY = "FAKE-boot-envkey-q7x2m9w4p8";
const FAKE_AGENT_ID = "boot-bot-zz";

async function bootRows(): Promise<string[]> {
  const rows: string[] = [];
  const spies = (["log", "warn", "info", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { rows.push(args.map(String).join(" ")); }));
  try {
    const { register } = await import("./instrumentation");
    await register();
  } finally {
    spies.forEach((s) => s.mockRestore());
  }
  return rows;
}

const legacyRows = (rows: string[]) => rows.filter((r) => r.startsWith("[auth-legacy]"));

/** Zero byte of a value in the rows: not the value, its sha256, or any 6-byte window of it. */
function leaks(rows: string[], value: string): boolean {
  const all = rows.join("\n");
  if (all.includes(createHash("sha256").update(value).digest("hex"))) return true;
  for (let i = 0; i + 6 <= value.length; i++) if (all.includes(value.slice(i, i + 6))) return true;
  return false;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/request-auth");
  vi.doUnmock("@/app/api/auth/init/route");
});

describe("T5 the [auth-legacy] boot rows (transformate WI-4496)", () => {
  it("T5 with fake values set: server path armed, env agent path armed, browser path off; zero byte of the values", async () => {
    vi.stubEnv("MC_ADMIN_TOKEN", FAKE_OWNER_KEY);
    vi.stubEnv("MC_AGENT_TOKENS", `${FAKE_AGENT_ID}:${FAKE_ENV_KEY}`);
    const rows = await bootRows();
    expect(legacyRows(rows)).toEqual([
      "[auth-legacy] arkon MC_ADMIN_TOKEN browser path: off",
      "[auth-legacy] arkon MC_ADMIN_TOKEN server path: armed",
      "[auth-legacy] arkon MC_AGENT_TOKENS env agent path: armed",
    ]);
    expect(leaks(rows, FAKE_OWNER_KEY)).toBe(false);
    expect(leaks(rows, FAKE_ENV_KEY)).toBe(false);
    expect(rows.join("\n")).not.toContain(FAKE_AGENT_ID);
  });

  it("T5 with the values unset or empty: every path off", async () => {
    vi.stubEnv("MC_ADMIN_TOKEN", "");
    vi.stubEnv("MC_AGENT_TOKENS", "");
    expect(legacyRows(await bootRows())).toEqual([
      "[auth-legacy] arkon MC_ADMIN_TOKEN browser path: off",
      "[auth-legacy] arkon MC_ADMIN_TOKEN server path: off",
      "[auth-legacy] arkon MC_AGENT_TOKENS env agent path: off",
    ]);
  });

  it("T5 an env value with no complete id:key pair arms no env agent path", async () => {
    vi.stubEnv("MC_ADMIN_TOKEN", "");
    vi.stubEnv("MC_AGENT_TOKENS", " , :only-a-key, only-an-id:");
    expect(legacyRows(await bootRows())).toContain("[auth-legacy] arkon MC_AGENT_TOKENS env agent path: off");
  });

  it("T5 (c) the browser row follows the built code: with the pre-U5 behaviour (a key in mc_auth resolves owner) it reads armed", async () => {
    vi.stubEnv("MC_ADMIN_TOKEN", FAKE_OWNER_KEY);
    vi.stubEnv("MC_AGENT_TOKENS", "");
    // The BEFORE artifact, by its behaviour: request-auth resolved the owner key from the mc_auth cookie.
    vi.doMock("@/lib/request-auth", async (orig) => {
      const real = await orig<typeof import("@/lib/request-auth")>();
      return {
        ...real,
        resolveRequestCredential: async (req: Parameters<typeof real.resolveRequestCredential>[0]) =>
          req.cookies.get("mc_auth")?.value === FAKE_OWNER_KEY ? { type: "owner_token" as const, role: "owner" as const, tenant_id: "*" } : real.resolveRequestCredential(req),
      };
    });
    const rows = await bootRows();
    expect(legacyRows(rows)).toContain("[auth-legacy] arkon MC_ADMIN_TOKEN browser path: armed");
    expect(leaks(rows, FAKE_OWNER_KEY)).toBe(false);
  });

  it("T5 (c) the browser row follows the built code: an init that sets an mc_auth cookie for the key reads armed", async () => {
    vi.stubEnv("MC_ADMIN_TOKEN", FAKE_OWNER_KEY);
    vi.stubEnv("MC_AGENT_TOKENS", "");
    // The BEFORE artifact, by its behaviour: init set mc_auth to the presented key (init/route.ts:69-75 at the base).
    vi.doMock("@/app/api/auth/init/route", async () => {
      const { NextResponse } = await import("next/server");
      return {
        POST: async () => {
          const res = NextResponse.json({ ok: true, role: "owner" });
          res.cookies.set("mc_auth", FAKE_OWNER_KEY, { httpOnly: true, path: "/" });
          return res;
        },
      };
    });
    expect(legacyRows(await bootRows())).toContain("[auth-legacy] arkon MC_ADMIN_TOKEN browser path: armed");
  });

  it("T5 the boot rows never block the boot: the scheduler still starts after them", async () => {
    vi.stubEnv("MC_ADMIN_TOKEN", FAKE_OWNER_KEY);
    vi.stubEnv("MC_AGENT_TOKENS", "");
    const { startScheduler } = await import("@/lib/workflow-scheduler");
    const rows = await bootRows();
    expect(legacyRows(rows)).toHaveLength(3);
    expect(startScheduler).toHaveBeenCalledOnce();
  });
});
