import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { PATCH } from "./[id]/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("../_utils", () => ({
  parseJsonRecord: (value: unknown) => value,
  parseTextArray: (value: unknown) => value,
  unauthorized: () => new Response("Unauthorized", { status: 401 }),
  validateAdmin: () => true,
}));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [{ id: 42 }] } as never);
});

describe("docs PATCH content format default", () => {
  it("treats content-only PATCH requests as markdown instead of HTML", async () => {
    const markdown = '<img src="/x" onerror="alert(1)">';
    const req = new NextRequest("https://arkon.test/api/tools/docs/42", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: markdown }),
    });

    await PATCH(req, { params: Promise.resolve({ id: "42" }) });

    expect(mockQuery.mock.calls[0][1]?.[3]).toBe(markdown);
  });
});
