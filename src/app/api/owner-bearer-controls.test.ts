import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { proxy } from "@/proxy";
import { executeWorkflow } from "@/lib/workflow-engine";
import { GET as workflowsGET } from "@/app/api/workflows/route";
import { GET as costsOverviewGET } from "@/app/api/costs/overview/route";
import { POST as contentFactoryPOST, GET as contentFactoryGET } from "@/app/api/content-factory/status/route";
import { POST as infraReportPOST } from "@/app/api/infra/report/route";

/* T4, POSITIVE CONTROLS ON BOTH TREES (transformate WI-4495, S10): the owner key stays a server-to-server credential
   by the Bearer header until its own retire act. Each case runs one request through proxy.ts AND the route handler.
   GREEN at the base by design (S10, named): they pin that the Bearer road survives the set. FAKE values only. */

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue(undefined) }));

const mockQuery = vi.mocked(query);
const FAKE_OWNER_KEY = "fake-u5-owner-key-0000000000000000";

function bearerReq(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`https://arkon.test${path}`, {
    method,
    headers: { authorization: `Bearer ${FAKE_OWNER_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** One request through the proxy gate, then the handler (the proxy reads no body). */
async function throughProxy(req: NextRequest, handler: (r: NextRequest) => Promise<Response>) {
  const gate = await proxy(req);
  if (gate.status !== 200 || gate.headers.get("location")) return gate;
  return handler(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  process.env.MC_AGENT_TOKENS = "";
  delete process.env.CRON_SECRET;
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM infra_nodes WHERE id = $1")) return { rows: [{ id: "node-1" }] } as never;
    return { rows: [], rowCount: 0 } as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ARKON_BASE_URL;
});

describe("T4 the owner key by Bearer still reaches the server routes (transformate WI-4495)", () => {
  it("T4 the owner key as a Bearer on a server route (GET /api/costs/overview) passes the proxy and the route check", async () => {
    const res = await throughProxy(bearerReq("/api/costs/overview"), costsOverviewGET);
    expect(res.status).toBe(200);
  });

  it("T4 workflow-engine's injected owner Bearer, end to end through the proxy and the route check (GET /api/workflows)", async () => {
    process.env.ARKON_BASE_URL = "https://arkon.test";
    const seen: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const req = new NextRequest(url, { method: init.method, headers: init.headers as Record<string, string> });
      const res = await throughProxy(req, workflowsGET);
      seen.push(res.status);
      return res;
    }));
    const result = await executeWorkflow({
      nodes: [
        { id: "t1", type: "manual-trigger", data: { label: "Start" } },
        { id: "h1", type: "http-request", data: { url: "https://arkon.test/api/workflows", internal: true } },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    expect(seen).toEqual([200]);
    const step = result.steps.find((s) => s.nodeId === "h1");
    expect(step?.status).toBe("success");
    expect((step?.output as { status?: number } | undefined)?.status).toBe(200);
  });

  it("T4 content-factory POST by the owner Bearer passes the proxy and the route check", async () => {
    const res = await throughProxy(bearerReq("/api/content-factory/status", "POST", { pipeline: "fake" }), contentFactoryPOST);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("T4 infra/report POST by the owner Bearer passes the proxy and the route check", async () => {
    const res = await throughProxy(bearerReq("/api/infra/report", "POST", { nodeId: "node-1", cpu: 1 }), infraReportPOST);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, nodeId: "node-1" });
  });

  it("T4 the arkon-os proxy path (generic /api/* by Bearer, arkon-os arkon.ts:15): a read and a write pass the proxy, CSRF-exempt", async () => {
    const read = await proxy(bearerReq("/api/agents"));
    expect(read.status).toBe(200);
    const write = await proxy(bearerReq("/api/tools/tasks", "POST", { title: "fake" }));
    expect(write.status).toBe(200);
  });
});

/* content-factory/status GET moves to the shared OWNER-ONLY check (transformate WI-4498): its mc_token cookie read
   (route.ts:64, the owner key carried by a cookie; nothing in src sets mc_token) goes. FAKE values only. */
describe("content-factory/status GET: the OWNER-ONLY check, zero mc_token cookie (transformate WI-4498 T1b)", () => {
  const hash = (t: string) => createHash("sha256").update(t).digest("hex");
  function cfGet(opts: { bearer?: string; cookies?: Record<string, string> }) {
    const r = new NextRequest("https://arkon.test/api/content-factory/status", opts.bearer ? { headers: { authorization: `Bearer ${opts.bearer}` } } : undefined);
    for (const [k, v] of Object.entries(opts.cookies ?? {})) r.cookies.set(k, v);
    return r;
  }
  beforeEach(() => {
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("JOIN user_sessions") && params?.[0] === hash("fake-owner-session")) {
        return { rows: [{ id: 1, email: "owner@example.test", role: "owner", tenant_id: null }] } as never;
      }
      if (sql.includes("JOIN user_sessions") && params?.[0] === hash("fake-admin-session")) {
        return { rows: [{ id: 2, email: "admin@example.test", role: "admin", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });
  });

  it("T1b the fake owner key in the mc_token cookie resolves zero owner: 401", async () => {
    const res = await contentFactoryGET(cfGet({ cookies: { mc_token: FAKE_OWNER_KEY } }));
    expect(res.status).toBe(401);
  });

  // GREEN at the base by design (S10, positive control).
  it("T1b the same fake owner key as a Bearer resolves: not refused", async () => {
    const res = await contentFactoryGET(cfGet({ bearer: FAKE_OWNER_KEY }));
    expect(res.status).not.toBe(401);
  });

  it("an owner session (mc_auth) reaches content-factory GET", async () => {
    const res = await contentFactoryGET(cfGet({ cookies: { mc_auth: "fake-owner-session" } }));
    expect(res.status).not.toBe(401);
  });

  // GREEN at the base by design (S10, named): zero widening, an admin session is no owner.
  it("an admin session is refused 401", async () => {
    const res = await contentFactoryGET(cfGet({ cookies: { mc_auth: "fake-admin-session" } }));
    expect(res.status).toBe(401);
  });
});
