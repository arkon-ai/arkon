/**
 * Arkon categorical colour palette — single source of truth for data-viz.
 *
 * WHY a TS module and not CSS var(--*) tokens: chart libraries (recharts) apply
 * series colours as SVG presentation ATTRIBUTES (fill="…", stroke="…"), where
 * CSS var() does NOT resolve. So categorical / series / brand colours that feed
 * charts must be literal values in JS. Semantic STATUS colours
 * (success / warning / danger / info) stay as CSS tokens (var(--*)) — they
 * render in className / style contexts where var() works.  (transformate WI-1159)
 *
 * Design law (arkon-design-system): no purple, no pink/rose (Brynn,
 * 2026-06-13). Ion-anchored 6-colour categorical scale — the anchor slot IS
 * Ion cyan (#2BD9FF, P6/transformate WI-1904) by deliberate design, not a
 * leftover; recharts applies it as an SVG presentation attribute so it stays
 * a literal here rather than a var(--ion). Add a new series colour here
 * rather than hardcoding a hex in a component.
 */

/**
 * 6-colour categorical scale. Order = default series-assignment order.
 * For rgba() opacity tints in CSS/style contexts use the matching
 * --chart-*-rgb companion tokens in src/app/globals.css (blue / teal / slate)
 * or --warning-rgb for amber. --ion-rgb is the exact companion for accent
 * (43, 217, 255 == #2BD9FF), but the one accent-tint consumer today
 * (agents-kit.tsx's warden chip) tints via rgba(var(--success-rgb), 0.16)
 * instead — a pre-existing, out-of-scope choice, not this file's guidance.
 * Keep any new accent-tint consumer in sync with whichever companion it picks.
 */
export const CHART = {
  accent: "#2BD9FF", // Ion anchor (P6, transformate WI-1904)
  amber: "#F59E0B",
  blue: "#3B82F6",
  teal: "#14B8A6",
  orange: "#F97316",
  slate: "#94A3B8", // neutral / fallback
} as const;

/** Default series order for charts that map index → colour. */
export const CHART_SERIES: readonly string[] = [
  CHART.accent,
  CHART.amber,
  CHART.blue,
  CHART.teal,
  CHART.orange,
  CHART.slate,
];

/**
 * Agent persona identity colours (a subset of the categorical scale).
 * Falls back to slate for unknown agents.
 */
export const AGENT_COLORS: Record<string, { fg: string }> = {
  warden: { fg: CHART.accent }, // the governor → Ion anchor
  codesmith: { fg: CHART.slate },
  lumina: { fg: CHART.amber },
  sentinel: { fg: CHART.teal },
};
export const FALLBACK_AGENT_COLOR = { fg: CHART.slate } as const;

/**
 * External platform brand marks — real brand colours, kept for recognizability.
 * These are the one sanctioned exception to "no raw hue outside the palette":
 * a LinkedIn/Discord chip must read as that platform.
 */
export const BRAND = {
  discord: "#5865F2",
  telegram: "#0088CC",
  whatsapp: "#25D366",
  linkedin: "#0A66C2",
} as const;
