import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

// transformate WI-3991, deck-main RULING 4122: the public setup endpoint may act only on a fresh install.
// A tiny in-memory tenants/agents table answers whichever SQL the route sends (old or new shape).
type Db = { tenants: Array<{ id: string; setup_completed: boolean }>; agents: Array<{ id: string; token_hash: string }> };
let db: Db;

function fakeQuery(sql: string, params: unknown[] = []) {
  const s = sql.replace(/\s+/g, " ");
  if (s.includes("AS default_tenants")) {
    return {
      rows: [{
        default_tenants: db.tenants.filter((t) => t.id === "default").length,
        other_tenants: db.tenants.filter((t) => t.id !== "default" || t.setup_completed).length,
        agents: db.agents.filter((a) => a.id !== "system").length,
      }],
    };
  }
  if (s.includes("SELECT setup_completed FROM tenants WHERE id = 'default'")) {
    return { rows: db.tenants.filter((t) => t.id === "default").map((t) => ({ setup_completed: t.setup_completed })) };
  }
  if (s.includes("SELECT id FROM agents WHERE id = $1")) {
    return { rows: db.agents.filter((a) => a.id === params[0]).map((a) => ({ id: a.id })) };
  }
  if (s.startsWith("UPDATE agents SET token_hash")) {
    const agent = db.agents.find((a) => a.id === params[4]);
    if (agent) agent.token_hash = String(params[0]);
    return { rows: [] };
  }
  if (s.startsWith("INSERT INTO agents")) {
    db.agents.push({ id: String(params[0]), token_hash: String(params[4]) });
    return { rows: [] };
  }
  if (s.startsWith("UPDATE tenants SET setup_completed")) {
    db.tenants.filter((t) => t.id === "default").forEach((t) => { t.setup_completed = true; });
    return { rows: [] };
  }
  return { rows: [] };
}

function post(body: unknown) {
  return POST(new NextRequest("https://arkon.test/api/setup/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(query).mockImplementation((async (sql: string, params?: unknown[]) => fakeQuery(sql, params)) as never);
});

describe("POST /api/setup/complete — first-run lock", () => {
  it("(1) existing agent, no 'default' tenant (the prod shape): step 'agent' is refused, token unchanged, no token returned", async () => {
    db = { tenants: [{ id: "transformate", setup_completed: false }], agents: [{ id: "lumina", token_hash: "orig" }] };
    const res = await post({ step: "agent", agent_name: "Lumina" });
    expect(res.status).toBe(403);
    expect(db.agents.find((a) => a.id === "lumina")?.token_hash).toBe("orig");
    expect(await res.json()).not.toHaveProperty("token");
  });

  it("(1b) fresh tenant but an agent already exists: step 'agent' never re-keys it", async () => {
    db = { tenants: [{ id: "default", setup_completed: false }], agents: [{ id: "system", token_hash: "seed:x" }, { id: "lumina", token_hash: "orig" }] };
    const res = await post({ step: "agent", agent_name: "Lumina" });
    expect(res.status).toBe(403);
    expect(db.agents.find((a) => a.id === "lumina")?.token_hash).toBe("orig");
    expect(await res.json()).not.toHaveProperty("token");
  });

  it("(2) any tenant beyond the bootstrap one exists: every step is refused", async () => {
    for (const body of [
      { step: "account", org_name: "Evil", admin_email: "x@example.test" },
      { step: "agent", agent_name: "New Bot" },
      { step: "complete" },
    ]) {
      db = { tenants: [{ id: "default", setup_completed: false }, { id: "transformate", setup_completed: false }], agents: [{ id: "system", token_hash: "seed:x" }] };
      const res = await post(body);
      expect(res.status, body.step).toBe(403);
      expect(db.agents.map((a) => a.id)).toEqual(["system"]);
      expect(db.tenants.every((t) => !t.setup_completed)).toBe(true);
    }
  });

  it("(3) a fresh migrated DB ('default' tenant + 'system' agent only): setup still works end to end (guard)", async () => {
    db = { tenants: [{ id: "default", setup_completed: false }], agents: [{ id: "system", token_hash: "seed:x" }] };
    expect((await post({ step: "account", org_name: "Acme", admin_email: "a@example.test" })).status).toBe(200);
    const agentRes = await post({ step: "agent", agent_name: "My Bot" });
    expect(agentRes.status).toBe(200);
    expect((await agentRes.json()).token).toMatch(/^ark_/);
    expect(db.agents.map((a) => a.id)).toContain("my-bot");
    expect((await post({ step: "complete" })).status).toBe(200);
    expect(db.tenants[0].setup_completed).toBe(true);
  });
});
