import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { checkAnomalies } from "@/lib/anomaly-detector";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as baselinePOST } from "@/app/api/cron/baseline/route";
import { POST as collectPOST } from "@/app/api/infra/collect/route";

/* THE THREE VALUE SITES (transformate WI-4498, S8): health/route.ts:82, cron/baseline/route.ts:18 and
   infra/collect/route.ts:221 use the owner check's result as a VALUE, not in `if (!check(req))`. The OWNER-ONLY check
   is async: without `await` the value is a Promise, which is truthy, so each "no credential" case below would turn
   green-for-anyone (/api/health is PUBLIC). Each site has its refusal case and its owner-session case. FAKE values. */

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/anomaly-detector", () => ({ checkAnomalies: vi.fn().mockResolvedValue(undefined), recomputeBaselines: vi.fn().mockResolvedValue(undefined) }));
vi.mock("child_process", () => ({ exec: vi.fn((_c: string, cb: (e: Error) => void) => cb(new Error("exec is mocked"))) }));
vi.mock("@/lib/ssh-exec", async (orig) => ({ ...(await orig<typeof import("@/lib/ssh-exec")>()), sshRun: vi.fn().mockRejectedValue(new Error("ssh is mocked")) }));

const mockQuery = vi.mocked(query);
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const SESSIONS: Record<string, { role: string; tenant_id: string | null }> = {
  "fake-owner-session": { role: "owner", tenant_id: null },
  "fake-admin-session": { role: "admin", tenant_id: "tenant-a" },
  "fake-viewer-session": { role: "viewer", tenant_id: "tenant-a" },
};

function req(path: string, method: string, cookies: Record<string, string> = {}) {
  const r = new NextRequest(`https://arkon.test${path}`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
}

let collectReads = 0;

beforeEach(() => {
  vi.clearAllMocks();
  collectReads = 0;
  process.env.MC_ADMIN_TOKEN = "fake-u5-owner-key-0000000000000000";
  process.env.MC_AGENT_TOKENS = "";
  process.env.CRON_SECRET = "fake-u5-cron-secret-7777";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions")) {
      const hit = Object.entries(SESSIONS).find(([t]) => hash(t) === params?.[0]);
      return { rows: hit ? [{ id: 1, email: "u@example.test", ...hit[1] }] : [] } as never;
    }
    if (sql.includes("infra_nodes")) collectReads++;
    return { rows: [], rowCount: 0 } as never;
  });
});

describe("health/route.ts:82 (PUBLIC): system details only for the owner (transformate WI-4498 S8)", () => {
  // GREEN at the base by design (S10, named): the trap case; a missed await turns it RED.
  it("no credential: /api/health shows zero system details", async () => {
    const body = await (await healthGET(req("/api/health", "GET"))).json();
    expect(body).not.toHaveProperty("system");
  });

  // GREEN at the base by design (S10, named): a non-owner session is no owner.
  it("an admin session: zero system details", async () => {
    const body = await (await healthGET(req("/api/health", "GET", { mc_auth: "fake-admin-session" }))).json();
    expect(body).not.toHaveProperty("system");
  });

  it("an owner session: the system details", async () => {
    const body = await (await healthGET(req("/api/health", "GET", { mc_auth: "fake-owner-session" }))).json();
    expect(body).toHaveProperty("system");
  });
});

describe("cron/baseline/route.ts:18: the cron secret or the owner (transformate WI-4498 S8)", () => {
  // GREEN at the base by design (S10, named): the trap case.
  it("no credential and no cron secret: 401 and zero anomaly run", async () => {
    const res = await baselinePOST(req("/api/cron/baseline", "POST"));
    expect(res.status).toBe(401);
    expect(checkAnomalies).not.toHaveBeenCalled();
  });

  // GREEN at the base by design (S10, named).
  it("a viewer session: 401 and zero anomaly run", async () => {
    const res = await baselinePOST(req("/api/cron/baseline", "POST", { mc_auth: "fake-viewer-session" }));
    expect(res.status).toBe(401);
    expect(checkAnomalies).not.toHaveBeenCalled();
  });

  it("an owner session: the anomaly check runs", async () => {
    const res = await baselinePOST(req("/api/cron/baseline", "POST", { mc_auth: "fake-owner-session" }));
    expect(res.status).toBe(200);
    expect(checkAnomalies).toHaveBeenCalledOnce();
  });
});

describe("infra/collect/route.ts:221: the cron secret or the owner (transformate WI-4498 S8)", () => {
  // GREEN at the base by design (S10, named): the trap case.
  it("no credential and no cron secret: 401 and zero node read", async () => {
    const res = await collectPOST(req("/api/infra/collect", "POST"));
    expect(res.status).toBe(401);
    expect(collectReads).toBe(0);
  });

  // GREEN at the base by design (S10, named).
  it("a viewer session: 401 and zero node read", async () => {
    const res = await collectPOST(req("/api/infra/collect", "POST", { mc_auth: "fake-viewer-session" }));
    expect(res.status).toBe(401);
    expect(collectReads).toBe(0);
  });

  it("an owner session: the collect runs (it reads the nodes)", async () => {
    const res = await collectPOST(req("/api/infra/collect", "POST", { mc_auth: "fake-owner-session" }));
    expect(res.status).not.toBe(401);
    expect(collectReads).toBeGreaterThan(0);
  });
});
