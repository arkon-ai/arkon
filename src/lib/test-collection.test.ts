import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import config from "../../vitest.config";

/* npm test collects EVERY tracked src test file (transformate WI-3996 item 1). The old script
   `vitest run src/**\/*.test.ts` ran under sh, where ** acts as *, and collected about half of src.
   vitest expands test.include itself; the script passes no positional glob (vitest reads those as path filters). */

const tracked = execFileSync("git", ["ls-files", ":(glob)src/**/*.test.ts", ":(glob)src/**/*.test.tsx"], { encoding: "utf8" })
  .trim().split("\n").sort();
const include = (config as { test?: { include?: string[] } }).test?.include ?? [];
// node 22 has fs.globSync; the installed @types/node predates it
const globSync = (fs as unknown as { globSync: (p: string[]) => string[] }).globSync;
const collected = globSync(include).sort();

describe("npm test collection (transformate WI-3996)", () => {
  it("the test script is plain `vitest run` (no shell glob)", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    expect(pkg.scripts.test).toBe("vitest run");
  });

  it("vitest.config test.include collects every tracked src test file", () => {
    expect(tracked.length).toBeGreaterThan(30);
    expect(collected).toEqual(expect.arrayContaining(tracked));
  });

  it("test.include collects nothing outside src (no Playwright tests/**/*.spec.ts)", () => {
    expect(include.length).toBeGreaterThan(0);
    expect(collected.filter((f) => !f.startsWith("src/"))).toEqual([]);
    expect(collected.some((f) => f.endsWith(".spec.ts"))).toBe(false);
  });
});

/* Two commands, two sets (deck-main RULING 4823): `npm test` runs the unit set, `npm run test:pg` runs the pg set
   (the files that need a throwaway PostgreSQL). Every tracked src test file is in exactly one of them. Each set is
   what vitest itself lists for that script (run through sh, as npm does), never a shell glob; the list starts at
   "vitest run", so test:pg's database wrapper is not started just to list. */
function listed(script: string): string[] {
  const at = script.indexOf("vitest run");
  if (at < 0) throw new Error(`no 'vitest run' in script: ${script}`);
  // plain lines, never --json: `--json <word>` takes the next word as an output FILE and overwrites it
  const cmd = script.slice(at).replace("vitest run", "vitest list --filesOnly");
  const env: Record<string, string | undefined> = { ...process.env, PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}` };
  for (const k of Object.keys(env)) if (k.startsWith("VITEST")) delete env[k];
  const out = execFileSync("sh", ["-c", cmd], { encoding: "utf8", env: env as NodeJS.ProcessEnv });
  return [...new Set(out.split("\n").map((l) => l.trim()).filter((l) => /\.test\.tsx?$/.test(l)))].sort();
}

function classify(all: string[], unit: string[], pg: string[]) {
  const neither = all.filter((f) => !unit.includes(f) && !pg.includes(f));
  const both = unit.filter((f) => pg.includes(f));
  return { neither, both, ok: neither.length === 0 && both.length === 0 };
}

describe("npm test + npm run test:pg: every tracked src test file runs in exactly one (RULING 4823)", () => {
  const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts;

  it("the unit set and the pg set cover every tracked src test file once; the pg set is named", () => {
    const unit = listed(scripts.test);
    const pg = listed(scripts["test:pg"] ?? "");
    const r = classify(tracked, unit, pg);
    console.log(`test sets: unit ${unit.length} + pg ${pg.length} of ${tracked.length} tracked; pg set: ${pg.join(", ")}`);
    for (const f of r.neither) console.log(`  IN NEITHER SET ${f}`);
    for (const f of r.both) console.log(`  IN BOTH SETS ${f}`);
    expect(r.neither).toEqual([]);
    expect(r.both).toEqual([]);
    expect(pg).toEqual(["src/app/api/setup/complete/route.pg.hooks.test.ts", "src/app/api/setup/complete/route.pg.test.ts"]);
    expect(r.ok).toBe(true);
  }, 60_000);

  it("a file in neither set or in both fails and is named, even when the total count matches", () => {
    const r = classify(["a.test.ts", "b.test.ts", "c.pg.test.ts"], ["a.test.ts", "c.pg.test.ts"], ["c.pg.test.ts"]);
    expect(r.neither).toEqual(["b.test.ts"]);
    expect(r.both).toEqual(["c.pg.test.ts"]);
    expect(r.ok).toBe(false);
    expect(classify(["a.test.ts", "c.pg.test.ts"], ["a.test.ts"], ["c.pg.test.ts"]).ok).toBe(true);
  });

  it("a tracked file the unit set excludes (and the pg set does not hold) is named", () => {
    const r = classify(tracked, listed("vitest run --exclude src/proxy.test.ts"), listed(scripts["test:pg"] ?? ""));
    expect(r.neither).toContain("src/proxy.test.ts");
    expect(r.ok).toBe(false);
  }, 60_000);
});
