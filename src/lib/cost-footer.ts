/**
 * cost-footer.ts — Pure cost computation + Markdown footer rendering.
 * DB `model_pricing` stores per-1K rates with a single `cached_input_discount_pct`
 * (no separate cache_creation column). We derive cache_read from the discount and
 * approximate cache_creation at 1.25x input. Hardcoded fallback has exact rates.
 */
import { query } from "@/lib/db";

export interface UsageStat {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheCreationCost: number;
  cacheReadCost: number;
  totalCost: number;
  model: string;
  source: "hardcoded" | "db";
}

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
  cacheCreationPerM: number;
  cacheReadPerM: number;
  source: "hardcoded" | "db";
}

// ──────────────────────────────────────────────────────────────────────────
// Hardcoded pricing table (April 2026 baseline)
// ──────────────────────────────────────────────────────────────────────────

const HARDCODED_PRICING: Record<string, Omit<ModelPricing, "source">> = {
  "claude-opus-4-6": {
    inputPerM: 15,
    outputPerM: 75,
    cacheCreationPerM: 18.75,
    cacheReadPerM: 1.5,
  },
  "claude-sonnet-4-6": {
    inputPerM: 3,
    outputPerM: 15,
    cacheCreationPerM: 3.75,
    cacheReadPerM: 0.3,
  },
  "claude-haiku-4-5": {
    inputPerM: 1,
    outputPerM: 5,
    cacheCreationPerM: 1.25,
    cacheReadPerM: 0.1,
  },
  "gpt-5-codex": {
    inputPerM: 5,
    outputPerM: 15,
    cacheCreationPerM: 0,
    cacheReadPerM: 0,
  },
};

const DEFAULT_PRICING: Omit<ModelPricing, "source"> = {
  inputPerM: 5,
  outputPerM: 15,
  cacheCreationPerM: 0,
  cacheReadPerM: 0,
};

// ──────────────────────────────────────────────────────────────────────────
// Pricing resolution
// ──────────────────────────────────────────────────────────────────────────

/**
 * Guess an Anthropic/OpenAI provider from a model slug.
 */
function providerFromModel(model: string): string {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o")) return "openai";
  return "anthropic";
}

/**
 * Fetch pricing from DB if possible, else fall back to the hardcoded table.
 * Never throws.
 */
export async function resolveModelPricing(model: string): Promise<ModelPricing> {
  const hardcoded = HARDCODED_PRICING[model] ?? DEFAULT_PRICING;

  try {
    const provider = providerFromModel(model);
    const result = await query(
      `SELECT cost_per_1k_input, cost_per_1k_output, cached_input_discount_pct
         FROM model_pricing
        WHERE provider = $1 AND model_id = $2
          AND effective_from <= CURRENT_DATE
          AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
        ORDER BY effective_from DESC
        LIMIT 1`,
      [provider, model],
    );

    if (!result?.rows?.length) {
      return { ...hardcoded, source: "hardcoded" };
    }

    const row = result.rows[0];
    const inputPer1k = parseFloat(row.cost_per_1k_input);
    const outputPer1k = parseFloat(row.cost_per_1k_output);
    const discountPct = parseFloat(row.cached_input_discount_pct) || 0;

    if (!Number.isFinite(inputPer1k) || !Number.isFinite(outputPer1k)) {
      return { ...hardcoded, source: "hardcoded" };
    }

    // Convert per-1K to per-1M; derive cache rates from the DB's discount pct.
    const inputPerM = inputPer1k * 1000;
    const outputPerM = outputPer1k * 1000;
    const discountMultiplier = Math.max(0, 1 - discountPct / 100);

    return {
      inputPerM,
      outputPerM,
      cacheCreationPerM: inputPerM * 1.25, // industry ratio; DB lacks a dedicated column
      cacheReadPerM: inputPerM * discountMultiplier,
      source: "db",
    };
  } catch {
    return { ...hardcoded, source: "hardcoded" };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Cost computation
// ──────────────────────────────────────────────────────────────────────────

function costFor(tokens: number, perM: number): number {
  if (!tokens || tokens <= 0 || !Number.isFinite(perM) || perM <= 0) return 0;
  return (tokens / 1_000_000) * perM;
}

export async function computeCost(usage: UsageStat): Promise<CostBreakdown> {
  const pricing = await resolveModelPricing(usage.model);

  const inputCost = costFor(usage.inputTokens, pricing.inputPerM);
  const outputCost = costFor(usage.outputTokens, pricing.outputPerM);
  const cacheCreationCost = costFor(usage.cacheCreationTokens ?? 0, pricing.cacheCreationPerM);
  const cacheReadCost = costFor(usage.cacheReadTokens ?? 0, pricing.cacheReadPerM);

  return {
    inputCost,
    outputCost,
    cacheCreationCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheCreationCost + cacheReadCost,
    model: usage.model,
    source: pricing.source,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Round USD to at most 4 decimals, trim trailing zeros, floor sub-half-cent to $0.00.
 */
function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00";
  if (amount < 0.005) return "$0.00";

  const rounded = Math.round(amount * 10_000) / 10_000;
  let s = rounded.toFixed(4);
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (!s.includes(".")) s += ".00";
  else if (s.split(".")[1].length === 1) s += "0";
  return `$${s}`;
}

/**
 * "2143" → "2.1k", "847" → "847", "1234567" → "1.2M".
 */
function formatTokensShort(n: number): string {
  if (!n || n <= 0) return "0";
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function formatTokensFull(n: number): string {
  return (n ?? 0).toLocaleString("en-US");
}

/**
 * Strip common vendor prefixes for the compact footer ("claude-opus-4-6" → "opus-4-6").
 */
function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/^gpt-/, "gpt-");
}

// ──────────────────────────────────────────────────────────────────────────
// Footer rendering
// ──────────────────────────────────────────────────────────────────────────

export function renderFooter(
  breakdown: CostBreakdown,
  opts?: { verbose?: boolean },
): string {
  if (opts?.verbose) return renderVerboseFooter(breakdown);

  // Without raw token counts we render just model + total. Use renderFooterFromUsage
  // for the "2.1k in + 847 out" form that /warden-chat will emit.
  const model = shortModel(breakdown.model);
  return [
    "",
    "---",
    `🛡️ warden · ${model} · ${formatUsd(breakdown.totalCost)}`,
  ].join("\n");
}

/**
 * Preferred short renderer when the caller still has the original usage in hand.
 * The /warden-chat route will use this to get the "2.1k in + 847 out" fragment.
 */
export function renderFooterFromUsage(
  usage: UsageStat,
  breakdown: CostBreakdown,
  opts?: { verbose?: boolean },
): string {
  if (opts?.verbose) return renderVerboseFooter(breakdown, usage);

  const model = shortModel(breakdown.model);
  const inTok = formatTokensShort(usage.inputTokens);
  const outTok = formatTokensShort(usage.outputTokens);
  return [
    "",
    "---",
    `🛡️ warden · ${model} · ${inTok} in + ${outTok} out · ${formatUsd(breakdown.totalCost)}`,
  ].join("\n");
}

function renderVerboseFooter(breakdown: CostBreakdown, usage?: UsageStat): string {
  const lines: string[] = ["", "---", `Model: ${breakdown.model}`];

  if (usage) {
    const cacheParts: string[] = [];
    if (usage.cacheCreationTokens && usage.cacheCreationTokens > 0) {
      cacheParts.push(`${formatTokensFull(usage.cacheCreationTokens)} created`);
    }
    if (usage.cacheReadTokens && usage.cacheReadTokens > 0) {
      cacheParts.push(`${formatTokensFull(usage.cacheReadTokens)} read`);
    }
    const cacheSuffix = cacheParts.length ? ` (cache: ${cacheParts.join(", ")})` : "";
    lines.push(
      `Tokens: ${formatTokensFull(usage.inputTokens)} in / ${formatTokensFull(usage.outputTokens)} out${cacheSuffix}`,
    );
  }

  const cacheTotal = breakdown.cacheCreationCost + breakdown.cacheReadCost;
  const costParts = [
    `in ${formatUsd(breakdown.inputCost)}`,
    `out ${formatUsd(breakdown.outputCost)}`,
  ];
  if (cacheTotal > 0) costParts.push(`cache ${formatUsd(cacheTotal)}`);

  lines.push(
    `Cost: ${formatUsd(breakdown.totalCost)} (${costParts.join(", ")})`,
  );
  return lines.join("\n");
}

export function renderAggregateFooter(breakdowns: CostBreakdown[]): string {
  if (!breakdowns.length) {
    return ["", "---", "🛡️ warden · (no usage) · $0.00"].join("\n");
  }

  const totalCost = breakdowns.reduce((s, b) => s + b.totalCost, 0);
  const byModel = new Map<string, number>();
  for (const b of breakdowns) {
    byModel.set(b.model, (byModel.get(b.model) ?? 0) + b.totalCost);
  }

  const modelSummary = Array.from(byModel.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([model, cost]) => `${shortModel(model)} ${formatUsd(cost)}`)
    .join(" + ");

  return [
    "",
    "---",
    `🛡️ warden · ${breakdowns.length} calls · ${modelSummary} · total ${formatUsd(totalCost)}`,
  ].join("\n");
}
