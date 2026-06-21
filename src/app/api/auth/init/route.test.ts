import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function postReq(bearer?: string) {
  const init: { method: string; headers?: Record<string, string> } = { method: "POST" };
  if (bearer) init.headers = { authorization: `Bearer ${bearer}` };
  return new NextRequest("https://arkon.test/api/auth/init", init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [] } as never);
  process.env.MC_AGENT_TOKENS = "";
});

describe("POST /api/auth/init owner elevation (WI-1346 #5)", () => {
  it("grants owner on an exact admin-token match", async () => {
    process.env.MC_ADMIN_TOKEN = "a".repeat(80);
    const res = await POST(postReq("a".repeat(80)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("owner");
  });

  // The bug this pins: a 64-byte-truncating compare would have matched any token
  // sharing the admin token's first 64 chars (and equal length) → owner.
  it("does NOT grant owner for a token sharing the admin token's first 64 chars", async () => {
    const prefix = "a".repeat(64);
    process.env.MC_ADMIN_TOKEN = `${prefix}XXXXXXXXXXXXXXXX`; // 80 chars
    const res = await POST(postReq(`${prefix}YYYYYYYYYYYYYYYY`)); // same length, differs after 64
    expect(res.status).toBe(401); // not owner, no DB match → unauthorized
  });
});
