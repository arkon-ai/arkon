import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

// The CI-only MCP registry fixture (deck-main RULING 4864 (1)): the E2E "MCP Registry API" tests
// read it instead of the live registry. Run as CI runs it: `node scripts/e2e-mcp-registry-fixture.mjs`.
const SCRIPT = fileURLToPath(new URL("../../scripts/e2e-mcp-registry-fixture.mjs", import.meta.url));

let child: ChildProcess;
let base: string;
let host: string;
let port: number;

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
      // Whatever address the fixture prints: a wrong bind must reach the bind tests, not this timeout.
      const m = out.match(/listening on http:\/\/(\S+):(\d+)\r?\n/);
      if (m) {
        clearTimeout(timer);
        host = m[1];
        port = Number(m[2]);
        resolve(`http://${host.includes(":") ? `[${host}]` : host}:${port}`);
      }
    });
  });
});

afterAll(() => {
  child?.kill();
});

// The kernel's own view of who listens on `port`, read outside the fixture (deck-main RULING 4872):
// `ss -ltnH`, else /proc/net/tcp{,6} decoded. Returns the local addresses, or null when neither
// source exists (not Linux).
function kernelListeners(port: number): { source: string; addresses: string[]; lines: string[] } | null {
  const ss = spawnSync("ss", ["-ltnH"], { encoding: "utf8" });
  if (ss.status === 0) {
    const lines = ss.stdout.split("\n").filter((l) => l.trim().split(/\s+/)[3]?.endsWith(`:${port}`));
    const addresses = lines.map((l) => {
      const local = l.trim().split(/\s+/)[3];
      return local.slice(0, local.lastIndexOf(":")).replace(/%.*$/, "");
    });
    return { source: "ss -ltnH", addresses, lines };
  }
  if (!existsSync("/proc/net/tcp")) return null;
  const lines: string[] = [];
  const addresses: string[] = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n").slice(1)) {
      const [, local, , st] = line.trim().split(/\s+/);
      if (st !== "0A" || !local) continue; // 0A = LISTEN
      const [hex, portHex] = local.split(":");
      if (Number.parseInt(portHex, 16) !== port) continue;
      lines.push(`${file}: ${line.trim()}`);
      // IPv4 is one little-endian word; IPv6 is four, each little-endian.
      const bytes = (hex.match(/.{8}/g) ?? []).flatMap((w) => (w.match(/../g) ?? []).reverse());
      addresses.push(
        hex.length === 8
          ? bytes.map((b) => Number.parseInt(b, 16)).join(".")
          : `[${(bytes.join("").match(/.{4}/g) ?? []).join(":")}]`,
      );
    }
  }
  return { source: "/proc/net/tcp{,6}", addresses, lines };
}

describe("e2e MCP registry fixture", () => {
  it("prints server.address() as 127.0.0.1", () => {
    expect(host).toBe("127.0.0.1");
  });

  it("the kernel's listeners on its port are 127.0.0.1 only (ss, else /proc/net/tcp)", (ctx) => {
    const seen = kernelListeners(port);
    if (!seen) ctx.skip("neither `ss` nor /proc/net/tcp exists on this host (not Linux): listener check not run");
    console.log(`[fixture-bind] ${seen!.source} port ${port}: ${seen!.lines.join(" | ")}`);
    expect(seen!.addresses.length, seen!.source).toBeGreaterThan(0);
    expect(seen!.addresses, seen!.source).toEqual(seen!.addresses.map(() => "127.0.0.1"));
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
