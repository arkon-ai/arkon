import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "@/lib/db";
import { hashToken, validateAgentToken, validateToken } from "./auth-utils";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_AGENT_TOKENS = "";
});

describe("validateAgentToken", () => {
  it("accepts a DB-backed issued agent token even when it is absent from MC_AGENT_TOKENS", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: "agent-db" }] } as never);

    await expect(validateAgentToken("Bearer issued-token")).resolves.toBe("agent-db");
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT id FROM agents WHERE token_hash = $1 LIMIT 1",
      [hashToken("issued-token")]
    );
  });

  it("keeps MC_AGENT_TOKENS as a bootstrap fallback", async () => {
    process.env.MC_AGENT_TOKENS = "bootstrap:bootstrap-token";
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(validateAgentToken("Bearer bootstrap-token")).resolves.toBe("bootstrap");
  });

  it("does not accept a long bootstrap token that only matches the first 64 characters", async () => {
    const prefix = "a".repeat(64);
    process.env.MC_AGENT_TOKENS = `bootstrap:${prefix}X`;
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(validateAgentToken(`Bearer ${prefix}Y`)).resolves.toBeNull();
  });

  it("rejects unknown bearer tokens", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    await expect(validateAgentToken("Bearer unknown")).resolves.toBeNull();
  });
});

/* T6 (transformate WI-4495): each MC_AGENT_TOKENS hit logs ONE warning row naming the agent id only (the Helm
   bridge-auth line 517 form), so each env pair's move to an agents row can be named pair by pair. Zero byte of the
   key in any console row: not the key, not its sha256, not any 6-byte window of it. Fixed FAKE values only. */
describe("T6 an MC_AGENT_TOKENS hit logs the agent id and zero byte of the key (transformate WI-4495)", () => {
  const FAKE_ENV_KEY = "FAKE-envkey-q7x2m9w4p8";

  function capture() {
    const rows: string[] = [];
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { rows.push(args.map(String).join(" ")); }));
    return { rows, restore: () => spies.forEach((s) => s.mockRestore()) };
  }

  function leaksKey(rows: string[]): boolean {
    const all = rows.join("\n");
    if (all.includes(hashToken(FAKE_ENV_KEY))) return true;
    for (let i = 0; i + 6 <= FAKE_ENV_KEY.length; i++) if (all.includes(FAKE_ENV_KEY.slice(i, i + 6))) return true;
    return false;
  }

  beforeEach(() => {
    process.env.MC_AGENT_TOKENS = `bootstrap-bot:${FAKE_ENV_KEY}`;
    mockQuery.mockResolvedValue({ rows: [] } as never);
  });

  it("T6 validateAgentToken: one warning row names the agent id, zero byte of the key", async () => {
    const out = capture();
    try {
      await expect(validateAgentToken(`Bearer ${FAKE_ENV_KEY}`)).resolves.toBe("bootstrap-bot");
    } finally {
      out.restore();
    }
    const hits = out.rows.filter((r) => r.includes("bootstrap-bot"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/\[auth-legacy\]/);
    expect(leaksKey(out.rows)).toBe(false);
  });

  it("T6 validateToken: one warning row names the agent id, zero byte of the key", () => {
    const out = capture();
    try {
      expect(validateToken(`Bearer ${FAKE_ENV_KEY}`)).toBe("bootstrap-bot");
    } finally {
      out.restore();
    }
    const hits = out.rows.filter((r) => r.includes("bootstrap-bot"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/\[auth-legacy\]/);
    expect(leaksKey(out.rows)).toBe(false);
  });

  // GREEN at the base by design (S10, named control): a DB-issued agent token is no env pair, so no warning row.
  it("a DB-issued agent token logs zero auth-legacy row", async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: "agent-db" }] } as never);
    const out = capture();
    try {
      await expect(validateAgentToken("Bearer issued-token")).resolves.toBe("agent-db");
    } finally {
      out.restore();
    }
    expect(out.rows.filter((r) => r.includes("[auth-legacy]"))).toEqual([]);
  });
});
