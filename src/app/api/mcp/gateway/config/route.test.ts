import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { proxy } from "@/proxy";
import { GET } from "./route";
import { POST as mcpProxyPOST } from "@/app/api/mcp/proxy/[serverId]/route";

/* T8 and (f) (transformate WI-4496, S9): the MCP client config export (claude-code, cursor, raw) writes ZERO byte of
   the owner key: a server with no gateway_token is listed with the omission note and zero header (D.U5.2 (a)); a
   server's own gateway_token is its header. (f): that gateway_token as a Bearer reaches /api/mcp through proxy.ts
   (proxy.ts:113 refused it at the base), so an exported config works end to end. Fixed FAKE values only. */

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);
const FAKE_OWNER_KEY = "fake-u5-export-owner-key-00000000";
// Shares no 6-byte window with FAKE_OWNER_KEY, so the T8 window check reads the owner key only.
const FAKE_GATEWAY_TOKEN = "fake-gw-token-for-mcp-6666";
const SERVERS = [
  { id: 1, name: "With Token", url: "http://127.0.0.1:9/mcp", host: "127.0.0.1", port: 9, server_type: "http", config_json: null, gateway_enabled: true, gateway_token: FAKE_GATEWAY_TOKEN, tenant_id: "default" },
  { id: 2, name: "No Token", url: "http://127.0.0.1:9/other", host: "127.0.0.1", port: 9, server_type: "http", config_json: null, gateway_enabled: true, gateway_token: null, tenant_id: "default" },
];

function exportReq(format: string) {
  return new NextRequest(`https://arkon.test/api/mcp/gateway/config?format=${format}`, { headers: { authorization: `Bearer ${FAKE_OWNER_KEY}` } });
}

/** Zero byte of the key: not the key, nor any 6-byte window of it. */
function holdsKeyBytes(text: string, key: string) {
  for (let i = 0; i + 6 <= key.length; i++) if (text.includes(key.slice(i, i + 6))) return true;
  return false;
}

type Entry = { url: string; headers?: Record<string, string>; note?: string };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = "";
  process.env.ARKON_BASE_URL = "https://arkon.test";
  delete process.env.MC_GATEWAY_URL;
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM mcp_servers WHERE id = $1")) return { rows: SERVERS.filter((s) => s.id === Number(params?.[0])) } as never;
    if (sql.includes("FROM mcp_servers")) return { rows: SERVERS } as never;
    return { rows: [] } as never;
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), {
    status: 200, headers: { "content-type": "application/json" },
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ARKON_BASE_URL;
});

describe("T8 gateway/config holds zero byte of the owner key in each export form (transformate WI-4496)", () => {
  it.each(["claude-code", "cursor"])("T8 %s: zero byte of the fake owner key in the output", async (format) => {
    const res = await GET(exportReq(format));
    expect(res.status).toBe(200);
    expect(holdsKeyBytes(await res.text(), FAKE_OWNER_KEY)).toBe(false);
  });

  // GREEN at the base by design (S10, named): the raw form never carried a header; this pins it.
  it("T8 raw: zero byte of the fake owner key in the output", async () => {
    const res = await GET(exportReq("raw"));
    expect(res.status).toBe(200);
    expect(holdsKeyBytes(await res.text(), FAKE_OWNER_KEY)).toBe(false);
  });

  it.each(["claude-code", "cursor"])("(f) %s: a tokenless server is listed with the omission note and zero header", async (format) => {
    const body = await (await GET(exportReq(format))).json();
    const entry = body.config.mcpServers["no-token"] as Entry;
    expect(entry.url).toBe("https://arkon.test/api/mcp/proxy/2");
    expect(entry.headers).toBeUndefined();
    expect(entry.note).toMatch(/gateway token/i);
  });

  it("(f) raw: a tokenless server shows the omission note", async () => {
    const body = await (await GET(exportReq("raw"))).json();
    const entry = (body.servers as Array<{ id: number; note?: string }>).find((s) => s.id === 2);
    expect(entry?.note ?? "").toMatch(/gateway token/i);
    expect((body.servers as Array<{ id: number; note?: string }>).find((s) => s.id === 1)?.note).toBeUndefined();
  });

  // GREEN at the base by design (S10, named control): a server's own gateway_token is its header.
  it("a server with a gateway_token carries its own token as the header", async () => {
    const body = await (await GET(exportReq("claude-code"))).json();
    expect((body.config.mcpServers["with-token"] as Entry).headers).toEqual({ Authorization: `Bearer ${FAKE_GATEWAY_TOKEN}` });
  });
});

describe("(f) a server's gateway_token Bearer reaches /api/mcp through proxy.ts (transformate WI-4496, S9)", () => {
  it("(f) the gateway_token as a Bearer passes the proxy gate for POST /api/mcp/proxy/1 (no CSRF, no owner credential)", async () => {
    const res = await proxy(new NextRequest("https://arkon.test/api/mcp/proxy/1", {
      method: "POST", headers: { authorization: `Bearer ${FAKE_GATEWAY_TOKEN}`, "content-type": "application/json" }, body: "{}",
    }));
    expect(res.status).toBe(200);
  });

  it("(f) an exported claude-code config works end to end: its url and header pass proxy.ts and the mcp proxy route", async () => {
    const body = await (await GET(exportReq("claude-code"))).json();
    const entry = body.config.mcpServers["with-token"] as Entry;
    const req = new NextRequest(entry.url, {
      method: "POST",
      headers: { ...entry.headers, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const gate = await proxy(req);
    expect(gate.status).toBe(200);
    const res = await mcpProxyPOST(req, { params: Promise.resolve({ serverId: "1" }) });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });

  // GREEN at the base by design (S10, named control): a junk Bearer never reaches the MCP server.
  it("a junk Bearer on /api/mcp/proxy/1 is refused 401 (by the gate or by the route) and reaches no MCP server", async () => {
    const req = () => new NextRequest("https://arkon.test/api/mcp/proxy/1", {
      method: "POST", headers: { authorization: "Bearer junk-token", "content-type": "application/json" }, body: "{}",
    });
    const gate = await proxy(req());
    const status = gate.status !== 200 ? gate.status : (await mcpProxyPOST(req(), { params: Promise.resolve({ serverId: "1" }) })).status;
    expect(status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  // GREEN at the base by design (S10, named control): the gateway token opens /api/mcp/proxy/ only.
  it("the gateway_token as a Bearer on any other /api/* path is refused 401", async () => {
    const res = await proxy(new NextRequest("https://arkon.test/api/mcp/gateway/config", { headers: { authorization: `Bearer ${FAKE_GATEWAY_TOKEN}` } }));
    expect(res.status).toBe(401);
  });
});
