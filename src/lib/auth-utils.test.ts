import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "@/lib/db";
import { hashToken, validateAgentToken } from "./auth-utils";

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
