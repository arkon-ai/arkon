import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/* scripts/with-throwaway-pg.sh keeps its header's promises (transformate WI-3996 unit A FOLD 4): PG_BIN is the knob,
   and the cluster dir is removed on exit, also after a failure. Each arm runs the wrapper under its own fresh TMPDIR
   and reads that TMPDIR after the wrapper exits. In the pg set: it needs the PostgreSQL 16 binaries. */

const REAL_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";
const made: string[] = [];
afterAll(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function run(cmd: string[], opts: { pgBin?: string; space?: boolean } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), opts.space ? "wrap arm " : "wrap-arm-"));
  made.push(tmp);
  const env: Record<string, string | undefined> = { ...process.env, TMPDIR: tmp };
  for (const k of Object.keys(env)) if (k.startsWith("VITEST")) delete env[k];
  if (opts.pgBin) env.PG_BIN = opts.pgBin;
  else delete env.PG_BIN;
  const r = spawnSync("bash", ["scripts/with-throwaway-pg.sh", ...cmd], { env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000 });
  const left = readdirSync(tmp).filter((f) => f.startsWith("arkon-pg."));
  const procs = spawnSync("pgrep", ["-f", tmp], { encoding: "utf8" }).stdout.trim();
  return { status: r.status, out: `${r.stdout}${r.stderr}`, left, procs };
}

// the server is up: its unix socket exists in the dir SETUP_PG_URL names
const SOCKET_UP = ["sh", "-c", 's=${SETUP_PG_URL#*host=}; s=$(printf %s "$s" | sed "s/%20/ /g"); test -S "$s/.s.PGSQL.55433"'];

describe("with-throwaway-pg.sh: PG_BIN is the knob; the dir goes, also after a failure (FOLD 4)", () => {
  it("PG_BIN exported to the real bin dir: rc 0, server up, 0 dirs left", () => {
    const r = run(SOCKET_UP, { pgBin: REAL_BIN });
    expect(r.out).not.toMatch(/unbound variable/);
    expect(r.status, r.out).toBe(0);
    expect(r.left).toEqual([]);
  }, 60_000);

  it("PG_BIN exported to a dir that does not exist: rc non-zero, the message names the path, 0 dirs left", () => {
    const r = run(["true"], { pgBin: "/nonexistent/pg16/bin" });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("/nonexistent/pg16/bin");
    expect(r.left).toEqual([]);
  }, 60_000);

  it("a TMPDIR holding a space: rc 0, server up, 0 dirs left", () => {
    const r = run(SOCKET_UP, { space: true });
    expect(r.status, r.out).toBe(0);
    expect(r.left).toEqual([]);
  }, 60_000);

  it("SIGTERM to the wrapper mid-run: rc 143, 0 dirs left, no postgres process of that dir left", () => {
    const r = run(["sh", "-c", "kill -TERM $PPID; sleep 1"]);
    expect(r.status).toBe(143);
    expect(r.left).toEqual([]);
    expect(r.procs).toBe("");
  }, 60_000);

  it("the command fails (exit 7): rc 7, 0 dirs left", () => {
    const r = run(["sh", "-c", "exit 7"]);
    expect(r.status).toBe(7);
    expect(r.left).toEqual([]);
  }, 60_000);
});
