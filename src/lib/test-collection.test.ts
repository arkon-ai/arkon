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
