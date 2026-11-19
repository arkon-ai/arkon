import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { POST } from "./route";

/* The MCP gateway proxy route (src/app/api/mcp/proxy/[serverId]/route.ts): its own Bearer check admits the server's
   gateway_token or the owner key. Fixed FAKE values only; the upstream MCP server is a stubbed fetch. */

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const FAKE_OWNER_KEY = "fake-u5-owner-key-0000000000000000";
const FAKE_ENV_KEY = "FAKE-envkey-q7x2m9w4p8";
const FAKE_GATEWAY_TOKEN = "fake-u5-gateway-token-6666";

const server = {
  id: 1, name: "Fake MCP", url: "http://127.0.0.1:9/mcp", host: "127.0.0.1", port: 9, server_type: "http",
  config_json: null, gateway_enabled: true, gateway_token: FAKE_GATEWAY_TOKEN, tenant_id: "default",
};

function mcpPost(opts: { bearer?: string; cookies?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  const req = new NextRequest("https://arkon.test/api/mcp/proxy/1", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  for (const [k, v] of Object.entries(opts.cookies ?? {})) req.cookies.set(k, v);
  return req;
}

const ctx = { params: Promise.resolve({ serverId: "1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = `bootstrap-bot:${FAKE_ENV_KEY}`;
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM mcp_servers WHERE id = $1")) return { rows: [server] } as never;
    return { rows: [] } as never;
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), {
    status: 200, headers: { "content-type": "application/json" },
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mcp proxy: a key by cookie resolves nothing, the same key by Bearer does (transformate WI-4495 T1b)", () => {
  // GREEN at the base by design (S10, named): the route's extractToken was Bearer only already (brief r2b row 20).
  it("T1b the fake owner key in the mc_auth cookie is refused 401 by the mcp proxy", async () => {
    const res = await POST(mcpPost({ cookies: { mc_auth: FAKE_OWNER_KEY } }), ctx);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  // GREEN at the base by design (S10, named): the mcp proxy never took an env agent key.
  it("T1b a fake MC_AGENT_TOKENS key in the mc_auth cookie is refused 401 by the mcp proxy", async () => {
    const res = await POST(mcpPost({ cookies: { mc_auth: FAKE_ENV_KEY } }), ctx);
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  // GREEN at the base by design (S10, positive control).
  it("T1b the same fake owner key as a Bearer is admitted by the mcp proxy", async () => {
    const res = await POST(mcpPost({ bearer: FAKE_OWNER_KEY }), ctx);
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
