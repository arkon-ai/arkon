import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Token-parity contract for globals.css against @arkon-ai/ui.
 *
 * (i)   floors + order + >=1.15x adjacent-step separation on the installed
 *       package's dark text ramp (the assertion WI-1852 lacked).
 * (ii)  --fg-2-rgb / --fg-3-rgb triplets in globals.css == the RGB channels
 *       of the installed package's --text-secondary / --text-tertiary
 *       (kills the rgb-companion drift class).
 * (iii) P6/ION canonical values + one-hop alias resolution (--void → --hull,
 *       --quarn → --ion) against the INSTALLED 0.3.0 package, using the same
 *       resolveVar idiom arkonhelm's globals.test.ts proved for WI-1903 —
 *       the package's legacy names are now var() aliases, not literals, so a
 *       literal-only resolver silently breaks (or vacuously passes) here.
 * (iv)  light-mode (P6 §3) values resolve correctly through the ACTUAL
 *       cascade this app renders: package :root (dark, layered) <
 *       package .theme-light (layered) < this file's :root (unlayered) <
 *       this file's [data-theme="light"] (unlayered) — unlayered always
 *       outranks layered regardless of source order (CSS cascade layers),
 *       so a merged map modeling that precedence is required, not a flat
 *       parse of either file alone.
 *
 * transformate WI-1878 (i, ii) / WI-1904 (iii, iv) — 2026-07-14
 * Panel R1 fix-forward (2026-07-13, see arkon-ui's ADJUDICATION.md): strip
 * comments before parsing (a commented-out token was reading as live —
 * vacuous pass); require exactly one top-level occurrence of each matched
 * block (a duplicate would silently last-wins in the browser but was
 * invisible to this test); require --fg-2-rgb/--fg-3-rgb PRESENT (not just
 * equal-if-present) so deleting one FAILs instead of being silently skipped.
 */

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const globalsCss = stripComments(readFileSync("src/app/globals.css", "utf8"));
const tokensCss = stripComments(readFileSync("node_modules/@arkon-ai/ui/css/tokens.css", "utf8"));

// ── Shared parsing helpers (mirrors check-shell-token-mirror.mjs) ─────────

function parseProps(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(--[a-z][a-z0-9-]*)[ \t]*:[ \t]*([^;}{]+?)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    map.set(m[1].trim(), m[2].replace(/\s+/g, " ").trim());
  }
  return map;
}

/** Find every TOP-LEVEL block whose opening selector matches startRe (brace-counted). */
function findAllBlocks(css: string, startRe: RegExp): string[] {
  const flags = startRe.flags.includes("g") ? startRe.flags : startRe.flags + "g";
  const re = new RegExp(startRe.source, flags);
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    let depth = 0;
    let blockStart = -1;
    let i = match.index;
    for (; i < css.length; i++) {
      if (css[i] === "{") {
        depth++;
        if (depth === 1) blockStart = i + 1;
      } else if (css[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (blockStart === -1 || i >= css.length) break; // unmatched braces — stop scanning
    blocks.push(css.slice(blockStart, i));
    re.lastIndex = i + 1; // resume after this block so nested content isn't re-matched
  }
  return blocks;
}

/** Require exactly one top-level block matching startRe; throw loud otherwise. */
function extractExactlyOneBlock(css: string, startRe: RegExp, label: string): string {
  const blocks = findAllBlocks(css, startRe);
  if (blocks.length !== 1) {
    throw new Error(`globals.tokens.test.ts: expected exactly 1 top-level ${label} block, found ${blocks.length}`);
  }
  return blocks[0];
}

/**
 * globals.css (unlike the canonical tokens.css) legitimately declares more
 * than one top-level :root block — e.g. a second one exists purely for
 * --fs-metric, an Arkon-local type-scale override, unrelated to the ramp.
 * A blanket "exactly 1 block" rule would false-positive on that. Instead:
 * merge all top-level :root blocks in file order (matching real browser
 * cascade — later declarations win), and separately flag if any of
 * `trackedProps` is declared more than once — THAT specific duplication is
 * the silently-last-wins defect panel R1 fix #2 is about.
 */
function mergeRootBlocks(css: string, startRe: RegExp, trackedProps: string[]): { merged: Map<string, string>; duplicates: string[] } {
  const blocks = findAllBlocks(css, startRe);
  if (blocks.length === 0) {
    throw new Error('globals.tokens.test.ts: no top-level :root block found in globals.css');
  }
  const merged = new Map<string, string>();
  const seenCounts = new Map<string, number>();
  for (const block of blocks) {
    for (const [prop, value] of parseProps(block)) {
      merged.set(prop, value); // last block wins, matching browser cascade
      seenCounts.set(prop, (seenCounts.get(prop) ?? 0) + 1);
    }
  }
  const duplicates = trackedProps.filter((p) => (seenCounts.get(p) ?? 0) > 1);
  return { merged, duplicates };
}

// ── WCAG 2.x contrast (gamma-linearized) — calibrated below before use ────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return (
    0.2126 * srgbChannelToLinear(rgb.r) +
    0.7152 * srgbChannelToLinear(rgb.g) +
    0.0722 * srgbChannelToLinear(rgb.b)
  );
}

function contrastRatio(L1: number, L2: number): number {
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastHex(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) throw new Error(`contrastHex: unparseable hex (${hexA} / ${hexB})`);
  return contrastRatio(relativeLuminance(a), relativeLuminance(b));
}

function resolveHex(props: Map<string, string>, name: string): string | null {
  const val = props.get(`--${name}`);
  if (val === undefined) return null;
  const trimmed = val.trim();
  return /^#?[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : null;
}

/** Follow var(--x) references in a props map to a concrete value — the
 * installed package aliases legacy names since 0.3.0 (e.g.
 * --void: var(--hull)). Cycle-safe; mirrors arkonhelm's globals.test.ts
 * idiom proved for the same P6 rollout (transformate WI-1903/1904). */
function resolveVar(
  props: Map<string, string>,
  name: string,
  seen = new Set<string>(),
): string | undefined {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const val = props.get(name)?.trim();
  if (!val) return undefined;
  const m = /^var\(\s*(--[a-z][a-z0-9-]*)\s*\)$/i.exec(val);
  return m ? resolveVar(props, m[1], seen) : val;
}

// Package :root (dark) and .theme-light are used by several describe blocks
// below — parse once here rather than duplicating the extraction.
const pkgRootBlock = extractExactlyOneBlock(tokensCss, /^:root\s*\{/m, ":root in @arkon-ai/ui tokens.css");
const pkgRootProps = parseProps(pkgRootBlock);
const pkgLightBlock = extractExactlyOneBlock(tokensCss, /^\.theme-light\s*\{/m, ".theme-light in @arkon-ai/ui tokens.css");
const pkgLightProps = parseProps(pkgLightBlock);

const localDarkTrackedProps = ["--fg-2-rgb", "--fg-3-rgb"];
const { merged: localDarkProps, duplicates: localDarkDuplicates } = mergeRootBlocks(
  globalsCss,
  /^:root\s*\{/m,
  localDarkTrackedProps,
);
const localLightBlock = extractExactlyOneBlock(globalsCss, /^\[data-theme="light"\]\s*\{/m, '[data-theme="light"] in globals.css');
const localLightProps = parseProps(localLightBlock);

// Merged cascade maps modeling what the BROWSER actually resolves — this
// app's :root/[data-theme] rules are unlayered, so they outrank the
// package's layered rules regardless of source order (CSS cascade layers),
// and [data-theme="light"] outranks plain :root once the theme is active.
const darkResolved = new Map([...pkgRootProps, ...localDarkProps]);
const lightResolved = new Map([...pkgRootProps, ...pkgLightProps, ...localDarkProps, ...localLightProps]);

describe("contrast function calibration (self-test — must pass before trusting AA math below)", () => {
  it("white/black = 21 +/- 0.01", () => {
    expect(Math.abs(contrastHex("#FFFFFF", "#000000") - 21)).toBeLessThanOrEqual(0.01);
  });

  it("#8A8A9A / #0A0A0C = 5.82 +/- 0.02 (WI-1852 live-verified pair — historical calibration reference, not a live token)", () => {
    expect(Math.abs(contrastHex("#8A8A9A", "#0A0A0C") - 5.82)).toBeLessThanOrEqual(0.02);
  });
});

describe("installed package dark text ramp — floors + order + separation (i)", () => {
  const AA_FLOOR = 4.5;
  const SEPARATION_FLOOR = 1.15;
  const backgrounds = ["hull", "surface-1", "surface-2"];
  const textTokens = ["text-primary", "text-secondary", "text-tertiary"];

  for (const text of textTokens) {
    for (const bg of backgrounds) {
      it(`--${text} on --${bg} clears the AA floor (${AA_FLOOR}:1)`, () => {
        const textHex = resolveHex(pkgRootProps, text);
        const bgHex = resolveHex(pkgRootProps, bg);
        expect(textHex, `--${text} missing/unparseable in package :root`).toBeTruthy();
        expect(bgHex, `--${bg} missing/unparseable in package :root`).toBeTruthy();
        expect(contrastHex(textHex!, bgHex!)).toBeGreaterThanOrEqual(AA_FLOOR);
      });
    }
  }

  it("orders dark luminance text-primary > text-secondary > text-tertiary", () => {
    const [L1, L2, L3] = textTokens.map((t) => relativeLuminance(hexToRgb(resolveHex(pkgRootProps, t)!)!));
    expect(L1).toBeGreaterThan(L2);
    expect(L2).toBeGreaterThan(L3);
  });

  it("keeps adjacent-step separation >= 1.15x (the check WI-1852 lacked)", () => {
    const [L1, L2, L3] = textTokens.map((t) => relativeLuminance(hexToRgb(resolveHex(pkgRootProps, t)!)!));
    expect(contrastRatio(L1, L2)).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
    expect(contrastRatio(L2, L3)).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
  });
});

describe("rgb-companion integrity (ii) — globals.css --fg-2-rgb/--fg-3-rgb vs installed package", () => {
  const pairs: Array<[string, string]> = [
    ["--fg-2-rgb", "text-secondary"],
    ["--fg-3-rgb", "text-tertiary"],
  ];

  it("does not declare --fg-2-rgb/--fg-3-rgb in more than one top-level :root block", () => {
    expect(localDarkDuplicates, `duplicated across multiple :root blocks: ${localDarkDuplicates.join(", ")}`).toEqual([]);
  });

  it("requires --fg-2-rgb and --fg-3-rgb present in globals.css :root (not just equal-if-present)", () => {
    for (const [rgbProp] of pairs) {
      expect(localDarkProps.has(rgbProp), `${rgbProp} missing from globals.css :root`).toBe(true);
    }
  });

  for (const [rgbProp, pkgToken] of pairs) {
    it(`${rgbProp} matches the RGB channels of the installed package's --${pkgToken}`, () => {
      const rgbVal = localDarkProps.get(rgbProp);
      expect(rgbVal, `${rgbProp} not found in globals.css :root`).toBeDefined();

      const pkgHex = resolveHex(pkgRootProps, pkgToken);
      expect(pkgHex, `--${pkgToken} missing/unparseable in package :root`).toBeTruthy();
      const rgb = hexToRgb(pkgHex!)!;
      const expected = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

      const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
      expect(norm(rgbVal!)).toBe(norm(expected));
    });
  }
});

describe("P6/ION canonical values + one-hop alias resolution (iii, transformate WI-1904)", () => {
  it("--ion = #2BD9FF (dark)", () => {
    expect(resolveVar(pkgRootProps, "--ion")?.toUpperCase()).toBe("#2BD9FF");
  });
  it("--hull = #070A0E (dark)", () => {
    expect(resolveVar(pkgRootProps, "--hull")?.toUpperCase()).toBe("#070A0E");
  });
  it("--text-tertiary = #7085A1 (dark)", () => {
    expect(resolveVar(pkgRootProps, "--text-tertiary")?.toUpperCase()).toBe("#7085A1");
  });
  it("--info = #4D8DFF (dark)", () => {
    expect(resolveVar(pkgRootProps, "--info")?.toUpperCase()).toBe("#4D8DFF");
  });
  it("--void one-hop resolves to --hull's literal (#070A0E)", () => {
    expect(resolveVar(pkgRootProps, "--void")?.toUpperCase()).toBe("#070A0E");
  });
  it("--quarn one-hop resolves to --ion's literal (#2BD9FF)", () => {
    expect(resolveVar(pkgRootProps, "--quarn")?.toUpperCase()).toBe("#2BD9FF");
  });
  it("--quarn-rgb resolves to --ion-rgb's literal channels", () => {
    const norm = (s: string) => s.replace(/\s+/g, "");
    expect(norm(resolveVar(pkgRootProps, "--quarn-rgb")!)).toBe(norm("43, 217, 255"));
  });
  it("this app's --accent (dark) resolves through the package chain to #2BD9FF", () => {
    // --accent is package-owned (var(--ion)); confirms the local alias block
    // did not fork it back to a literal (P6 §8.3 audit requirement).
    expect(resolveVar(darkResolved, "--accent")?.toUpperCase()).toBe("#2BD9FF");
  });
});

describe("light-mode (P6 §3) values resolve through the real cascade (iv, transformate WI-1904)", () => {
  it("--bg-primary (dark alias of --void in :root) is re-pinned to the light literal so light renders #F6F8FA, not Hull black", () => {
    // Regression guard for the defect this WI found: in :root, --bg-primary
    // aliases the deprecated --void, and neither the package nor this file
    // re-declares --void for light — without the light-scoped literal pin the
    // page background would stay dark Hull under [data-theme=light].
    expect(resolveVar(lightResolved, "--bg-primary")?.toUpperCase()).toBe("#F6F8FA");
  });
  it("--bg-deep / --background (also --void aliases in :root, and what <body> actually consumes) are pinned for light too", () => {
    // Panel binding-round finding (2026-07-14): the --bg-primary assertion
    // above does NOT cover these two — deleting their light-block pins leaves
    // every test green while <body className="bg-bg-deep"> re-renders Hull
    // black under light theme. Guard each consumed token, not just the source.
    expect(resolveVar(lightResolved, "--bg-deep")?.toUpperCase()).toBe("#F6F8FA");
    expect(resolveVar(lightResolved, "--background")?.toUpperCase()).toBe("#F6F8FA");
  });
  it("--text-primary = #0B1220 (light)", () => {
    expect(resolveVar(lightResolved, "--text-primary")?.toUpperCase()).toBe("#0B1220");
  });
  it("--text-secondary = #44546C (light)", () => {
    expect(resolveVar(lightResolved, "--text-secondary")?.toUpperCase()).toBe("#44546C");
  });
  it("--text-tertiary = #5A6C84 (light)", () => {
    expect(resolveVar(lightResolved, "--text-tertiary")?.toUpperCase()).toBe("#5A6C84");
  });
  it("--border-hover = #C8D2DE (light, derived — was a Quarn-tinted rgba())", () => {
    expect(resolveVar(lightResolved, "--border-hover")?.toUpperCase()).toBe("#C8D2DE");
  });
  it("--ion = #0794BD (light, D4 restriction — large-text/UI-component accent only)", () => {
    expect(resolveVar(lightResolved, "--ion")?.toUpperCase()).toBe("#0794BD");
  });
  it("--accent (light) resolves through --ion to #0794BD, not a frozen literal", () => {
    expect(resolveVar(lightResolved, "--accent")?.toUpperCase()).toBe("#0794BD");
  });
  it("--quarn (light) one-hop resolves to --ion's light literal (#0794BD) — not re-declared as a literal locally", () => {
    expect(localLightProps.has("--quarn"), "--quarn should not be re-declared in this app's light block (P6 §3)").toBe(false);
    expect(resolveVar(lightResolved, "--quarn")?.toUpperCase()).toBe("#0794BD");
  });
  it("light luminance ramp stays strictly ascending (text-primary darkest, tertiary lightest)", () => {
    const [L1, L2, L3] = ["--text-primary", "--text-secondary", "--text-tertiary"].map(
      (t) => relativeLuminance(hexToRgb(resolveVar(lightResolved, t)!)!),
    );
    expect(L1).toBeLessThan(L2);
    expect(L2).toBeLessThan(L3);
  });
});
