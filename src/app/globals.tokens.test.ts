import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Token-parity contract for globals.css against @arkon-ai/ui.
 *
 * (i)  floors + order + >=1.15x adjacent-step separation on the installed
 *      package's dark text ramp (the assertion WI-1852 lacked).
 * (ii) --fg-2-rgb / --fg-3-rgb triplets in globals.css == the RGB channels
 *      of the installed package's --text-secondary / --text-tertiary
 *      (kills the rgb-companion drift class).
 *
 * transformate WI-1878 — 2026-07-13
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

// Package :root is used by both describe blocks below — parse it once here
// rather than duplicating the extraction.
const pkgRootBlock = extractExactlyOneBlock(tokensCss, /^:root\s*\{/m, ":root in @arkon-ai/ui tokens.css");
const pkgRootProps = parseProps(pkgRootBlock);

describe("contrast function calibration (self-test — must pass before trusting AA math below)", () => {
  it("white/black = 21 +/- 0.01", () => {
    expect(Math.abs(contrastHex("#FFFFFF", "#000000") - 21)).toBeLessThanOrEqual(0.01);
  });

  it("#8A8A9A / #0A0A0C = 5.82 +/- 0.02 (WI-1852 live-verified pair)", () => {
    expect(Math.abs(contrastHex("#8A8A9A", "#0A0A0C") - 5.82)).toBeLessThanOrEqual(0.02);
  });
});

describe("installed package dark text ramp — floors + order + separation (i)", () => {
  const AA_FLOOR = 4.5;
  const SEPARATION_FLOOR = 1.15;
  const backgrounds = ["void", "surface-1", "surface-2"];
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

  const { merged: rootProps, duplicates } = mergeRootBlocks(globalsCss, /^:root\s*\{/m, pairs.map(([rgbProp]) => rgbProp));

  it("does not declare --fg-2-rgb/--fg-3-rgb in more than one top-level :root block", () => {
    expect(duplicates, `duplicated across multiple :root blocks: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("requires --fg-2-rgb and --fg-3-rgb present in globals.css :root (not just equal-if-present)", () => {
    for (const [rgbProp] of pairs) {
      expect(rootProps.has(rgbProp), `${rgbProp} missing from globals.css :root`).toBe(true);
    }
  });

  for (const [rgbProp, pkgToken] of pairs) {
    it(`${rgbProp} matches the RGB channels of the installed package's --${pkgToken}`, () => {
      const rgbVal = rootProps.get(rgbProp);
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
