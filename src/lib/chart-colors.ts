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
 * Design law (arkon-design-system): no purple. Quarn-anchored 6-colour
 * categorical scale — no cyan, no pink/rose (Brynn, 2026-06-13). Add a new
 * series colour here rather than hardcoding a hex in a component.
 */

/**
 * 6-colour categorical scale. Order = default series-assignment order.
 * For rgba() opacity tints in CSS/style contexts use the matching
 * --chart-*-rgb companion tokens in src/app/globals.css (blue / teal / slate),
 * or --warning-rgb / --quarn-rgb for amber / green. Keep both in sync.
 */
export const CHART = {
  green: "#00D47E", // Quarn anchor
  amber: "#F59E0B",
  blue: "#3B82F6",
  teal: "#14B8A6",
  orange: "#F97316",
  slate: "#94A3B8", // neutral / fallback
} as const;

/** Default series order for charts that map index → colour. */
export const CHART_SERIES: readonly string[] = [
  CHART.green,
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
  warden: { fg: CHART.green }, // the governor → Quarn anchor
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
