import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/tools/mcp-registry/route";

// arkon E2E "MCP Registry API" deterministic (deck-main RULING 4864 (1)): the route's registry
// base comes from MCP_REGISTRY_BASE so CI can point it at a local fixture; unset or invalid
// keeps the official registry.
vi.mock("@/lib/db", () => ({ query: vi.fn(async () => ({ rows: [] })) }));

const DEFAULT = "https://registry.modelcontextprotocol.io/v0";
const ADMIN = "test-only-not-a-secret";
const envSnapshot = {
  MC_ADMIN_TOKEN: process.env.MC_ADMIN_TOKEN,
  MCP_REGISTRY_BASE: process.env.MCP_REGISTRY_BASE,
};

let calls: string[];

function request(qs = "") {
  return new NextRequest(`https://arkon.test/api/tools/mcp-registry${qs}`, {
    headers: { authorization: `Bearer ${ADMIN}` },
  });
}

async function fetchedUrl(qs = "") {
  const res = await GET(request(qs));
  expect(res.status).toBe(200);
  expect(calls).toHaveLength(1);
  return calls[0];
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
    calls.push(String(url));
    return Response.json({ servers: [] });
  }));
  process.env.MC_ADMIN_TOKEN = ADMIN;
  delete process.env.MCP_REGISTRY_BASE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(envSnapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("GET /api/tools/mcp-registry registry base", () => {
  it("unset: calls the official registry, exactly as before", async () => {
    expect(await fetchedUrl("?search=notion")).toBe(`${DEFAULT}/servers?limit=30&offset=0&search=notion`);
  });

  it("MCP_REGISTRY_BASE set: calls that base", async () => {
    process.env.MCP_REGISTRY_BASE = "http://127.0.0.1:4010/v0";
    expect(await fetchedUrl("?search=github&limit=5&offset=2")).toBe(
      "http://127.0.0.1:4010/v0/servers?limit=5&offset=2&search=github",
    );
  });

  it("a trailing slash on the base does not double the path separator", async () => {
    process.env.MCP_REGISTRY_BASE = "https://registry.example.test/v0/";
    expect(await fetchedUrl()).toBe("https://registry.example.test/v0/servers?limit=30&offset=0");
  });

  for (const bad of [
    "not a url",
    "http://user:pass@registry.example.test/v0",
    "https://user@registry.example.test/v0",
    "file:///etc/v0",
    "ftp://registry.example.test/v0",
  ]) {
    it(`invalid base ${JSON.stringify(bad)}: the official default, one log line without the value`, async () => {
      process.env.MCP_REGISTRY_BASE = bad;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const res = await GET(request());
      expect(res.status).toBe(200);
      expect(calls).toEqual([`${DEFAULT}/servers?limit=30&offset=0`]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0].join(" "))).not.toContain(bad);
      expect(JSON.stringify(await res.json())).not.toContain(bad);
    });
  }

  it("the base is never echoed to a client when the registry fails", async () => {
    process.env.MCP_REGISTRY_BASE = "http://127.0.0.1:4010/v0";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const res = await GET(request());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("127.0.0.1");
  });
});
