import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { executeWorkflow, runWorkflow } from "./workflow-engine";
import type { WorkflowDefinition, WorkflowRecord } from "./workflow-engine";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

const mockQuery = vi.mocked(query);
const mockSend = vi.mocked(sendNotification);

function makeDef(
  triggerType = "manual-trigger",
  extra: { nodes?: WorkflowDefinition["nodes"]; edges?: WorkflowDefinition["edges"] } = {}
): WorkflowDefinition {
  const trigger: WorkflowDefinition["nodes"][0] = {
    id: "t1",
    type: triggerType,
    data: { label: "Start" },
  };
  return {
    nodes: [trigger, ...(extra.nodes ?? [])],
    edges: extra.edges ?? [],
  };
}

const baseWorkflow: WorkflowRecord = {
  id: 42,
  name: "test-workflow",
  definition: makeDef(),
  status: "active",
  trigger_type: "manual",
  trigger_config: null,
  tenant_id: "tenant-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OPENCLAW_GATEWAY_URL;
});

// ---------------------------------------------------------------------------
// Trigger detection
// ---------------------------------------------------------------------------

describe("executeWorkflow — trigger detection", () => {
  it("returns error when no trigger node is present", async () => {
    const r = await executeWorkflow({
      nodes: [{ id: "n1", type: "http-request", data: {} }],
      edges: [],
    });
    expect(r.error).toBe("No trigger node found");
    expect(r.steps).toHaveLength(0);
  });

  it("records a success step for manual-trigger with no further nodes", async () => {
    const r = await executeWorkflow(makeDef("manual-trigger"));
    expect(r.error).toBeUndefined();
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ nodeType: "manual-trigger", status: "success" });
  });

  it("records a success step for cron-trigger", async () => {
    const r = await executeWorkflow(makeDef("cron-trigger"));
    expect(r.steps[0]).toMatchObject({ nodeType: "cron-trigger", status: "success" });
  });

  it("injects webhookPayload fields into context so downstream condition can read them", async () => {
    const def: WorkflowDefinition = {
      nodes: [
        {
          id: "t1",
          type: "webhook-trigger",
          data: { webhookPayload: { event: "push", repo: "arkon" } },
        },
        {
          id: "c1",
          type: "condition",
          data: {
            field: "webhook_event",
            operator: "eq",
            value: "push",
            label: "Check event",
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "c1" }],
    };
    const r = await executeWorkflow(def);
    const condStep = r.steps.find((s) => s.nodeType === "condition");
    expect(condStep?.output).toMatchObject({ passed: true, field: "webhook_event" });
  });
});

// ---------------------------------------------------------------------------
// Condition node — branching + operator coverage
// ---------------------------------------------------------------------------

describe("executeWorkflow — condition node", () => {
  function condDef(
    operator: string,
    condValue: string,
    extraData: Record<string, unknown> = {}
  ): WorkflowDefinition {
    return {
      nodes: [
        { id: "t1", type: "manual-trigger", data: {} },
        {
          id: "cond",
          type: "condition",
          data: { field: "status", operator, value: condValue, ...extraData },
        },
        { id: "n-pass", type: "notify", data: { channel: "log", message: "pass" } },
        { id: "n-fail", type: "notify", data: { channel: "log", message: "fail" } },
      ],
      edges: [
        { id: "e1", source: "t1", target: "cond" },
        { id: "e2", source: "cond", target: "n-pass", sourceHandle: "true" },
        { id: "e3", source: "cond", target: "n-fail", sourceHandle: "false" },
      ],
    };
  }

  it("eq: true branch executed, false branch skipped when value matches", async () => {
    // context.status is undefined → String coerces to "" — match against ""
    const r = await executeWorkflow(condDef("eq", ""));
    expect(r.steps.find((s) => s.nodeId === "n-pass")?.status).toBe("success");
    expect(r.steps.find((s) => s.nodeId === "n-fail")?.status).toBe("skipped");
  });

  it("eq: false branch executed, true branch skipped when value does not match", async () => {
    const r = await executeWorkflow(condDef("eq", "nonexistent-value"));
    expect(r.steps.find((s) => s.nodeId === "n-pass")?.status).toBe("skipped");
    expect(r.steps.find((s) => s.nodeId === "n-fail")?.status).toBe("success");
  });

  it("gt: numeric comparison — 0 > 10 is false, takes false branch", async () => {
    // context.status = "" → Number("") = 0; expected = "10" → 0 > 10 = false
    const r = await executeWorkflow(condDef("gt", "10"));
    expect(r.steps.find((s) => s.nodeId === "n-fail")?.status).toBe("success");
    expect(r.steps.find((s) => s.nodeId === "n-pass")?.status).toBe("skipped");
  });

  it("contains: empty string is contained in any string — takes true branch", async () => {
    // context.status = "" → "".includes("") = true
    const r = await executeWorkflow(condDef("contains", ""));
    expect(r.steps.find((s) => s.nodeId === "n-pass")?.status).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

describe("executeWorkflow — node types", () => {
  it("http-request: successful fetch → step success, context.status and body set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true }),
      })
    );

    const def = makeDef("manual-trigger", {
      nodes: [
        { id: "h1", type: "http-request", data: { url: "https://example.com/api", method: "GET", allowPublicUnauth: true } },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    const r = await executeWorkflow(def);
    const step = r.steps.find((s) => s.nodeType === "http-request");
    expect(step?.status).toBe("success");
    expect(step?.output).toMatchObject({ status: 200 });
  });

  it("http-request: does not inject MC_ADMIN_TOKEN when internal host only appears in path", async () => {
    process.env.MC_ADMIN_TOKEN = "admin-token";
    process.env.ARKON_BASE_URL = "https://internal.example";
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await executeWorkflow(makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://evil.example/path?next=https://internal.example/api", internal: true, allowPublicUnauth: true } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    }));

    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("authorization");
  });

  it("http-request: does not inject MC_ADMIN_TOKEN when internal host only appears in query", async () => {
    process.env.MC_ADMIN_TOKEN = "admin-token";
    process.env.ARKON_BASE_URL = "https://internal.example";
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await executeWorkflow(makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://evil.example?host=internal.example", internal: true, allowPublicUnauth: true } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    }));

    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("authorization");
  });

  it("http-request: injects MC_ADMIN_TOKEN only for explicit exact internal origin", async () => {
    process.env.MC_ADMIN_TOKEN = "admin-token";
    process.env.ARKON_BASE_URL = "https://internal.example";
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await executeWorkflow(makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://internal.example/api/workflows", internal: true } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    }));

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer admin-token" });
  });

  it("http-request: fetch throws → step failed, execution halts with error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    const def = makeDef("manual-trigger", {
      nodes: [
        { id: "h1", type: "http-request", data: { url: "https://example.com/api", method: "GET", allowPublicUnauth: true } },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    const r = await executeWorkflow(def);
    expect(r.error).toBe("network timeout");
    expect(r.steps.find((s) => s.nodeType === "http-request")?.status).toBe("failed");
  });

  it("unknown node type → step skipped with descriptive reason", async () => {
    const def = makeDef("manual-trigger", {
      nodes: [{ id: "u1", type: "custom-node-xyz", data: { label: "Mystery" } }],
      edges: [{ id: "e1", source: "t1", target: "u1" }],
    });
    const r = await executeWorkflow(def);
    const step = r.steps.find((s) => s.nodeId === "u1");
    expect(step?.status).toBe("skipped");
    expect(JSON.stringify(step?.output)).toContain("Unknown node type");
  });

  it("agent-action: missing OPENCLAW_GATEWAY_URL → 503 output, step marked failed", async () => {
    const def = makeDef("manual-trigger", {
      nodes: [
        {
          id: "a1",
          type: "agent-action",
          data: { tool: "search", agent_id: "agent-1" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    });
    const r = await executeWorkflow(def);
    const step = r.steps.find((s) => s.nodeType === "agent-action");
    expect(step?.status).toBe("failed");
    expect(step?.output).toMatchObject({ status: 503 });
  });

  it("notify with channel=log → step success without calling external fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "n1", type: "notify", data: { channel: "log", message: "hello" } }],
      edges: [{ id: "e1", source: "t1", target: "n1" }],
    });
    const r = await executeWorkflow(def);
    const step = r.steps.find((s) => s.nodeType === "notify");
    expect(step?.status).toBe("success");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Malformed inputs
// ---------------------------------------------------------------------------

describe("executeWorkflow — malformed inputs", () => {
  it("empty nodes array → error: No trigger node found", async () => {
    const r = await executeWorkflow({ nodes: [], edges: [] });
    expect(r.error).toBe("No trigger node found");
    expect(r.steps).toHaveLength(0);
  });

  it("trigger with no outgoing edges → only trigger step, no error", async () => {
    const r = await executeWorkflow(makeDef());
    expect(r.error).toBeUndefined();
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].nodeType).toBe("manual-trigger");
  });

  it("edge pointing to non-existent node → skips missing node gracefully", async () => {
    const def: WorkflowDefinition = {
      nodes: [{ id: "t1", type: "manual-trigger", data: {} }],
      edges: [{ id: "e1", source: "t1", target: "ghost-node" }],
    };
    const r = await executeWorkflow(def);
    expect(r.error).toBeUndefined();
    // ghost-node has no entry in nodeMap → loop body hits `if (!node) continue`
    expect(r.steps).toHaveLength(1);
  });

  it("template interpolation: known key is substituted, unknown key kept as-is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => "text/plain" },
        text: async () => "ok",
      })
    );

    // Inject a context value via a prior HTTP step setting context.status,
    // then reference it + an unknown key in the second HTTP node URL.
    const def: WorkflowDefinition = {
      nodes: [
        { id: "t1", type: "manual-trigger", data: {} },
        {
          id: "h1",
          type: "http-request",
          data: {
            url: "https://api.example.com/{{unknownKey}}/path",
            method: "GET",
            allowPublicUnauth: true,
          },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    };
    await executeWorkflow(def);
    const calledUrl = (vi.mocked(fetch).mock.calls[0][0] as string);
    // Unknown key kept intact
    expect(calledUrl).toContain("{{unknownKey}}");
  });
});

// ---------------------------------------------------------------------------
// Public-host fail-closed guard (transformate WI-198)
// ---------------------------------------------------------------------------

describe("executeWorkflow — http-request public-host guard (WI-198)", () => {
  it("blocks public host without auth header → step failed, fetch never called", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://mc.transformateai.com/api/security/overview", method: "GET" } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    const r = await executeWorkflow(def);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.error).toMatch(/^BLOCKED_PUBLIC_HOST_UNAUTH:/);
    expect(r.steps.find((s) => s.nodeType === "http-request")?.status).toBe("failed");
  });

  it("allows public host WITH Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://api.example.com/x", headers: { Authorization: "Bearer abc" } } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    const r = await executeWorkflow(def);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(r.steps.find((s) => s.nodeType === "http-request")?.status).toBe("success");
  });

  it("allows public host WITH X-API-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://api.example.com/x", headers: { "X-API-Key": "k1" } } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    await executeWorkflow(def);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("allows public host with allowPublicUnauth opt-out", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://feeds.example.com/rss", allowPublicUnauth: true } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    await executeWorkflow(def);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["loopback IPv4", "http://127.0.0.1:3000/api/health"],
    ["loopback hostname", "http://localhost:8080/health"],
    ["RFC1918 10.x", "http://10.0.0.5:8080/x"],
    ["RFC1918 192.168.x", "http://192.168.1.42/x"],
    ["RFC1918 172.16-31.x", "http://172.20.5.5/x"],
    ["Tailscale CGNAT 100.108.x", "http://100.108.57.71:5432/x"],
  ])("allows private host (%s) without auth", async (_label, url) => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    await executeWorkflow(def);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("public host with internal=true + matching ARKON_BASE_URL → auto-injected token satisfies guard", async () => {
    process.env.MC_ADMIN_TOKEN = "admin-token";
    process.env.ARKON_BASE_URL = "https://mc.transformateai.com";
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const def = makeDef("manual-trigger", {
      nodes: [{ id: "h1", type: "http-request", data: { url: "https://mc.transformateai.com/api/health", internal: true } }],
      edges: [{ id: "e1", source: "t1", target: "h1" }],
    });
    await executeWorkflow(def);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: "Bearer admin-token" });
  });
});

// ---------------------------------------------------------------------------
// runWorkflow — lifecycle
// ---------------------------------------------------------------------------

describe("runWorkflow", () => {
  it("successful execution → status completed, UPDATE uses 'completed'", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 99 }] } as never) // INSERT workflow_runs
      .mockResolvedValue({ rows: [] } as never); // UPDATEs

    const result = await runWorkflow(baseWorkflow, "manual");
    expect(result.runId).toBe(99);
    expect(result.status).toBe("completed");
    expect(result.error).toBeUndefined();

    const updateCall = mockQuery.mock.calls[1];
    expect(updateCall[0]).toContain("UPDATE workflow_runs");
    expect(updateCall[1]?.[0]).toBe("completed");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("failed execution (no trigger) → status failed, sendNotification fired", async () => {
    const failWorkflow: WorkflowRecord = {
      ...baseWorkflow,
      definition: { nodes: [], edges: [] },
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 100 }] } as never)
      .mockResolvedValue({ rows: [] } as never);

    const result = await runWorkflow(failWorkflow, "cron");
    expect(result.status).toBe("failed");
    expect(result.error).toBe("No trigger node found");
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      type: "workflow_failure",
      severity: "warning",
    });
  });

  it("triggeredBy value is forwarded in the INSERT query args", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 101 }] } as never)
      .mockResolvedValue({ rows: [] } as never);

    await runWorkflow(baseWorkflow, "webhook");
    const insertArgs = mockQuery.mock.calls[0][1] as unknown[];
    expect(insertArgs).toContain("webhook");
  });

  it("public-host guard block → auto-pauses workflow + emits workflow_auto_paused notification", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wfBlocked: WorkflowRecord = {
      ...baseWorkflow,
      id: 4242,
      name: "Threat Escalation Alert",
      definition: {
        nodes: [
          { id: "t1", type: "manual-trigger", data: {} },
          { id: "h1", type: "http-request", data: { url: "https://mc.transformateai.com/api/security/overview" } },
        ],
        edges: [{ id: "e1", source: "t1", target: "h1" }],
      },
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 999 }] } as never) // INSERT workflow_runs
      .mockResolvedValue({ rows: [] } as never);              // every subsequent UPDATE

    const result = await runWorkflow(wfBlocked, "cron");
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/^BLOCKED_PUBLIC_HOST_UNAUTH:/);
    expect(fetchMock).not.toHaveBeenCalled();

    // Pause UPDATE was issued
    const pauseUpdate = mockQuery.mock.calls.find((c) => /SET status='paused'/.test(String(c[0])));
    expect(pauseUpdate).toBeDefined();
    expect(pauseUpdate?.[1]).toEqual([4242]);

    // Notification was workflow_auto_paused, not workflow_failure
    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      type: "workflow_auto_paused",
      severity: "warning",
      metadata: { workflowId: 4242, reason: "public_host_unauth" },
    });
  });
});
