import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Terminal-success semantic invariant (defect class proven on arkonhelm,
 * transformate WI-1903/1904 — P6/ION rollout): keys like done/completed/
 * shipped/success MUST route through --success, never --accent/--quarn. The
 * old Quarn Emerald accent and the success green were visually close enough
 * that a wrong mapping went unnoticed; Ion (a bright cyan) makes the same
 * mistake loud and visible — but only if a future map re-introduces it.
 *
 * This repo has no current violation (verified 2026-07-14 by the sweep
 * below, run against the pre-fix source tree). This test exists purely as a
 * regression guard: it is grep-complete over src/, so a new stray map fails
 * CI without anyone having to enumerate it in review.
 *
 * "live"/"online"/"active" keys are NOT terminal-success semantics (they
 * mean "currently running", not "finished/passed") and are deliberately
 * excluded — the design law's 7 statuses (live/warm/idle/err/info/ok/
 * neutral) treat "live" as the ONE animated, accent-colored status,
 * distinct from "ok" (success-colored). Mapping "live"/"online" to
 * --accent/--quarn is correct by design, not a defect.
 */
describe("no terminal-success semantic key maps to var(--accent)/var(--quarn) anywhere in src/", () => {
  it("source sweep", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const p = resolve(dir, e);
        if (statSync(p).isDirectory()) return walk(p);
        return /\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e) ? [p] : [];
      });
    const offenders: string[] = [];
    const re = /\b(success|completed|done|shipped)\s*:\s*"var\(--(accent|quarn)\)"/g;
    for (const f of walk(resolve(__dirname, ".."))) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
