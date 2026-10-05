import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";

// The CI-only MCP registry fixture (deck-main RULING 4864 (1)): the E2E "MCP Registry API" tests
// read it instead of the live registry. Run as CI runs it: `node scripts/e2e-mcp-registry-fixture.mjs`.
const SCRIPT = fileURLToPath(new URL("../../scripts/e2e-mcp-registry-fixture.mjs", import.meta.url));

let child: ChildProcess;
let base: string;

type Page = { servers: Array<{ server: { name: string } }>; metadata: { count: number } };

async function get(path: string) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as Page) : null };
}

beforeAll(async () => {
  child = spawn(process.execPath, [SCRIPT], {
    env: { ...process.env, MCP_REGISTRY_FIXTURE_PORT: "0" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fixture did not start in 10 s")), 10_000);
    child.once("exit", (code) => reject(new Error(`fixture exited early: ${code}`)));
    let out = "";
    child.stdout!.on("data", (chunk) => {
      out += String(chunk);
      const m = out.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });
});

afterAll(() => {
  child?.kill();
});

describe("e2e MCP registry fixture", () => {
  it("binds 127.0.0.1 only", () => {
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("search=notion and search=github each return more than 0 matching servers", async () => {
    for (const term of ["notion", "github"]) {
      const { status, body } = await get(`/v0/servers?limit=30&offset=0&search=${term}`);
      expect(status).toBe(200);
      expect(body!.servers.length).toBeGreaterThan(0);
      for (const entry of body!.servers) expect(entry.server.name.toLowerCase()).toContain(term);
    }
  });

  it("honours search: a term nothing matches returns an empty page", async () => {
    const { status, body } = await get("/v0/servers?search=zz-no-such-server");
    expect(status).toBe(200);
    expect(body!.servers).toEqual([]);
    expect(body!.metadata.count).toBe(0);
  });

  it("an empty search returns every server", async () => {
    const all = await get("/v0/servers?limit=100");
    const empty = await get("/v0/servers?limit=100&offset=0&search=");
    expect(all.body!.servers.length).toBeGreaterThanOrEqual(4);
    expect(empty.body!.servers).toEqual(all.body!.servers);
  });

  it("honours limit and offset", async () => {
    const all = (await get("/v0/servers?limit=100")).body!.servers;
    const page = await get("/v0/servers?limit=2&offset=1");
    expect(page.body!.servers).toEqual(all.slice(1, 3));
    expect(page.body!.metadata.count).toBe(2);
    expect((await get(`/v0/servers?offset=${all.length}`)).body!.servers).toEqual([]);
  });

  it("answers the official response shape the route reads", async () => {
    const { body } = await get("/v0/servers?search=notion");
    const entry = body!.servers[0] as unknown as Record<string, Record<string, unknown>>;
    expect(typeof entry.server.name).toBe("string");
    expect(typeof entry.server.description).toBe("string");
    expect(typeof entry.server.version).toBe("string");
    expect(entry._meta).toBeTypeOf("object");
  });

  it("any other path is 404", async () => {
    for (const path of ["/", "/v0", "/v0/servers/x", "/v1/servers", "/v0/servers/../../etc/passwd"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});
