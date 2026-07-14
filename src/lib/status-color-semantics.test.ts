import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const srcRoot = resolve(repoRoot, "src");

/**
 * Terminal-success semantic invariant (defect class proven on arkonhelm,
 * transformate WI-1903/1904 — P6/ION rollout): keys/branches like done/
 * completed/shipped/success/ok/passed/ready/finished MUST route through
 * --success, never --accent/--quarn/--ion. The old Quarn Emerald accent and
 * the success green were visually close enough that a wrong mapping went
 * unnoticed pre-P6; Ion (a bright cyan) makes the same mistake loud and
 * visible — but only if a future map re-introduces it.
 *
 * Panel R1 (2026-07-14, manifest a0f05621cd06) CONFIRMED MAJOR: this file's
 * first version claimed "grep-complete" but its regex only matched
 * double-quoted object-literal `key: "var(--accent)"` forms (arkonhelm's
 * STATUS_OPTIONS idiom) — it missed the wizard components' inline-ternary
 * tint form entirely (`status === "success" ? "rgba(var(--ion-rgb), a)" :
 * ...`), which is how address-step.tsx/emergency-step.tsx/test-step.tsx
 * actually encoded this and where the real defect shipped. Three sweeps now:
 *
 * (a) Flat object-literal key form (unchanged from the original,
 *     terminal-key list broadened per panel instruction to add
 *     ok/passed/ready/finished, both quote styles): `key: "var(--accent)"`.
 * (b) Ternary form: for every `"<terminal-key>" ? <branch>` in src/, the
 *     immediately-following branch (a single quoted/templated string) must
 *     not contain --ion-rgb / --quarn-rgb / var(--accent). Validated against
 *     both the pre-fix (flags) and post-fix (silent) wizard source before
 *     landing this version (transformate WI-1904 panel response).
 * (c) Nested-object-value form: `key: { bg: "...", text: "var(--quarn)" }` —
 *     added after (b)'s repo-wide sweep (rather than the original's
 *     wizard-only scope) caught a REAL, previously-unflagged instance:
 *     workflows.tsx's STATUS_COLORS.completed/.success both mapped to
 *     --quarn. Fixed alongside this sweep (2026-07-14).
 *
 * "live"/"online"/"active" are NOT terminal-success semantics (they mean
 * "currently running", not "finished/passed") and are deliberately excluded
 * — the design law's 7 statuses (live/warm/idle/err/info/ok/neutral) treat
 * "live" as the ONE animated, accent-colored status, distinct from "ok"
 * (success-colored). Mapping "live"/"online" to --accent/--quarn is correct
 * by design, not a defect.
 *
 * In-progress/transient action affordances that happen to only render in a
 * success/idle state (spinners, a "copied" tick, a retry button, a
 * dashboard-link CTA, item-selection checkboxes) are excluded by
 * CONSTRUCTION, not by exemption list: they are not keyed on a ternary
 * whose condition literally compares to a terminal-success string, so
 * neither sweep below can see them. That is deliberate — actions keep
 * doing accent's CTA job; only status readouts must be success-colored
 * (panel R1 adjudication, transformate WI-1904).
 */

const TERMINAL_KEYS = ["success", "ok", "passed", "ready", "finished", "completed", "done", "shipped"];

function walkTs(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = resolve(dir, e);
    if (statSync(p).isDirectory()) return walkTs(p);
    return /\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e) ? [p] : [];
  });
}

describe("no terminal-success semantic key maps to var(--accent)/var(--quarn) anywhere in src/ (flat object-literal form)", () => {
  it("source sweep", () => {
    const offenders: string[] = [];
    const re = new RegExp(`\\b(${TERMINAL_KEYS.join("|")})\\s*:\\s*["'\`](?:var\\(--(?:accent|quarn|ion)\\)|rgba?\\(var\\(--(?:accent|quarn|ion)-rgb\\)[^)]*\\))["'\`]`, "g");
    for (const f of walkTs(srcRoot)) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("no terminal-success semantic key maps to var(--accent)/var(--quarn) anywhere in src/ (nested-object form, e.g. STATUS_COLORS lookup tables)", () => {
  it("source sweep", () => {
    // Catches `completed: { bg: "...", text: "var(--quarn)" }` — a terminal
    // key whose value is a flat nested object containing a quarn/accent
    // reference anywhere inside (bg/text/color/fg property names all vary
    // by call site, so this checks the whole object body rather than
    // enumerating property names). `[^{}]*` bounds the match to a single
    // non-nested object literal, which is how every STATUS_COLORS-style
    // table in this codebase is actually shaped.
    //
    // Found a real (pre-existing, unrelated to the wizard files panel R1
    // named) instance of this exact shape while validating this sweep:
    // workflows.tsx's STATUS_COLORS.completed/.success both mapped to
    // --quarn — fixed alongside this test (transformate WI-1904 panel R1
    // response, 2026-07-14).
    const offenders: string[] = [];
    const re = new RegExp(`\\b(${TERMINAL_KEYS.join("|")})\\s*:\\s*\\{([^{}]*)\\}`, "g");
    for (const f of walkTs(srcRoot)) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (/var\(--quarn\)|var\(--accent\)|var\(--ion\)|--quarn-rgb|--accent-rgb|--ion-rgb/.test(m[2])) {
          offenders.push(`${f}: ${m[1]} -> ${m[2].replace(/\s+/g, " ").trim()}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("no terminal-success ternary branch resolves to Ion/accent anywhere in src/ (inline-ternary form, panel R1)", () => {
  it("source sweep", () => {
    const offenders: string[] = [];
    // Matches `"success" ? <branch>` (any of the terminal keys, either quote
    // style around the key) and captures the single quoted/templated string
    // immediately taken as that ternary's true-branch value. The `[^"]`/
    // `[^']`/`[^\`]` character classes span newlines (these ternaries are
    // always multi-line in this codebase), so this is whitespace-agnostic.
    const re = new RegExp(
      `["'](?:${TERMINAL_KEYS.join("|")})["']\\s*\\?\\s*(\`[^\`]*\`|"[^"]*"|'[^']*')`,
      "g",
    );
    for (const f of walkTs(srcRoot)) {
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const branch = m[1];
        if (/--ion-rgb|--quarn-rgb|--accent-rgb|var\(--accent\)|var\(--quarn\)|var\(--ion\)/.test(branch)) {
          offenders.push(`${f}: "success"-keyed ternary resolves to ${branch}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  // Explicit regression pins on the three files panel R1 found broken —
  // belt-and-suspenders on top of the general sweep above, since a general
  // sweep's regex shape is inherently more fragile than a pin naming the
  // exact file. If either sweep alone had a blind spot, this still fails.
  it.each([
    "src/components/agents/wizard/address-step.tsx",
    "src/components/agents/wizard/emergency-step.tsx",
    "src/components/agents/wizard/test-step.tsx",
  ])("%s: every 'success'-keyed style branch resolves through --success, not --ion-rgb/var(--accent)", (relPath) => {
    const src = readFileSync(resolve(repoRoot, relPath), "utf8");
    const re = /["'](?:success)["']\s*\?\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
    let m: RegExpExecArray | null;
    let sawAny = false;
    while ((m = re.exec(src)) !== null) {
      sawAny = true;
      expect(m[1], `${relPath}: "success" branch ${m[1]}`).not.toMatch(/--ion-rgb|--quarn-rgb|var\(--accent\)/);
    }
    expect(sawAny, `${relPath}: expected at least one "success"-keyed ternary (vacuous-pass guard)`).toBe(true);
  });
});

// Panel R1 (opus) — "live"/"online" are deliberately accent-colored (the ONE
// animated status, design law's 7-status set) and must stay excluded from
// the sweeps above. Pinned here so a future edit to TERMINAL_KEYS can't
// silently absorb them.
describe("'live'/'online' remain excluded from the terminal-success key list (design law, not a defect)", () => {
  it("TERMINAL_KEYS does not include live/online/active", () => {
    for (const k of ["live", "online", "active"]) {
      expect(TERMINAL_KEYS).not.toContain(k);
    }
  });
});
