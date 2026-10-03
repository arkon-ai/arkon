import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { POST } from "./route";
import { PUT } from "./[id]/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getClientIp: vi.fn(() => "127.0.0.1") }));

const mockQuery = vi.mocked(query);

function req(method: string, path: string, body: unknown) {
  return new NextRequest(`https://arkon.test${path}`, {
    method,
    headers: { authorization: "Bearer owner-secret", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  mockQuery.mockResolvedValue({ rows: [{ id: 1, name: "x", status: "draft", trigger_type: "manual" }] } as never);
});

// transformate WI-3989, deck-main RULING 4121: a workflow name is a plain label; markup is refused.
describe("workflow name refuses markup", () => {
  it("POST /api/workflows answers 400 for a name with < or >, and writes nothing", async () => {
    const res = await POST(req("POST", "/api/workflows", { name: '<script>alert("xss")</script>' }));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("PUT /api/workflows/[id] answers 400 for a name with < or >", async () => {
    const res = await PUT(req("PUT", "/api/workflows/1", { name: "a <b>bold</b> name" }), {
      params: Promise.resolve({ id: "1" }),
    });
    expect(res.status).toBe(400);
  });

  it("still accepts a plain name (guard)", async () => {
    const ok = await POST(req("POST", "/api/workflows", { name: "Nightly report" }));
    expect(ok.status).not.toBe(400);
  });
});
