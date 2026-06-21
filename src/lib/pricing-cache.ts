import { query } from "@/lib/db";

interface PricingEntry {
  provider: string;
  model_id: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  is_free: boolean;
  pricing_type: "per_token" | "subscription" | "free";
  monthly_cost_usd: number | null;
  cached_input_discount_pct: number;
  batch_discount_pct: number;
}

let cache: Map<string, PricingEntry> = new Map();
let lastRefresh = 0;
let degraded = false; // true when the last refresh failed (serving a stale/empty cache)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FAILURE_BACKOFF_MS = 30 * 1000; // retry a failed/empty refresh after 30s, not every call

/** True when the last refresh failed — cost estimates may be stale or fall back. */
export function isPricingDegraded(): boolean {
  return degraded;
}

/**
 * Refresh is due when the cache is empty (cold or last refresh failed — retry on
 * the short backoff, not on every call) or a populated cache has aged past TTL.
 * (WI-1357 #19 — avoids hammering a failing query and serves the previous cache.)
 */
function shouldRefresh(): boolean {
  const age = Date.now() - lastRefresh;
  return cache.size === 0 ? age > FAILURE_BACKOFF_MS : age > CACHE_TTL_MS;
}

function cacheKey(provider: string, modelId: string): string {
  return `${provider}::${modelId}`;
}

async function refreshCache(): Promise<void> {
  try {
    const result = await query(
      `SELECT provider, model_id, cost_per_1k_input, cost_per_1k_output, is_free,
              pricing_type, monthly_cost_usd, cached_input_discount_pct, batch_discount_pct
       FROM model_pricing
       WHERE effective_from <= CURRENT_DATE
         AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ORDER BY effective_from DESC`
    );
    const fresh = new Map<string, PricingEntry>();
    for (const row of result.rows) {
      const key = cacheKey(row.provider, row.model_id);
      if (!fresh.has(key)) {
        fresh.set(key, {
          provider: row.provider,
          model_id: row.model_id,
          cost_per_1k_input: parseFloat(row.cost_per_1k_input),
          cost_per_1k_output: parseFloat(row.cost_per_1k_output),
          is_free: row.is_free,
          pricing_type: row.pricing_type || "per_token",
          monthly_cost_usd: row.monthly_cost_usd ? parseFloat(row.monthly_cost_usd) : null,
          cached_input_discount_pct: parseFloat(row.cached_input_discount_pct) || 0,
          batch_discount_pct: parseFloat(row.batch_discount_pct) || 0,
        });
      }
    }
    cache = fresh;
    degraded = false;
  } catch (err) {
    // Keep the previously-loaded cache (better than nothing) and mark degraded.
    // lastRefresh still advances (finally) so we back off instead of re-hitting
    // the failing query on every estimateCost call. (WI-1357 #19.)
    console.error("[pricing-cache] refresh failed (serving previous cache):", err);
    degraded = true;
  } finally {
    lastRefresh = Date.now();
  }
}

export async function getPricing(provider: string, modelId: string): Promise<PricingEntry | null> {
  if (shouldRefresh()) {
    await refreshCache();
  }
  return cache.get(cacheKey(provider, modelId)) || null;
}

export async function getAllPricing(): Promise<PricingEntry[]> {
  if (shouldRefresh()) {
    await refreshCache();
  }
  return Array.from(cache.values());
}

/**
 * Estimate cost for an event.
 * Supports three pricing types:
 *   - per_token: standard input/output token rates with optional caching discount
 *   - subscription: returns 0 per-event (fixed monthly shown separately)
 *   - free: returns 0
 *
 * When actual input_tokens and output_tokens are provided, uses them directly.
 * Otherwise falls back to 60/40 split of tokenEstimate (legacy path).
 * Returns cost in USD.
 */
export async function estimateCost(
  tokenEstimate: number,
  metadata?: Record<string, unknown>,
  inputTokens?: number,
  outputTokens?: number,
  cachedInputTokens?: number
): Promise<number> {
  const hasActualTokens = typeof inputTokens === "number" && typeof outputTokens === "number"
    && (inputTokens > 0 || outputTokens > 0);

  if (!hasActualTokens && (!tokenEstimate || tokenEstimate <= 0)) return 0;

  const provider = (metadata?.provider as string) || "anthropic";
  const model = (metadata?.model as string) || "claude-sonnet-4-6";

  const pricing = await getPricing(provider, model);

  // Free or subscription models return 0 per-event
  if (pricing && (pricing.pricing_type === "free" || pricing.is_free)) return 0;
  if (pricing && pricing.pricing_type === "subscription") return 0;

  // Determine token counts
  let inTok: number;
  let outTok: number;

  if (hasActualTokens) {
    inTok = inputTokens!;
    outTok = outputTokens!;
  } else {
    // Legacy fallback: 60/40 split
    inTok = tokenEstimate * 0.6;
    outTok = tokenEstimate * 0.4;
  }

  if (!pricing) {
    // No pricing row (cold/degraded cache or unknown model). Only fall back to
    // hardcoded Anthropic Sonnet rates for Anthropic — for other providers we do
    // NOT fabricate a per-token charge (many are free/subscription and would be
    // wrongly billed at Sonnet rates). (WI-1357 #19.)
    if (provider === "anthropic") {
      return (inTok / 1000) * 0.003 + (outTok / 1000) * 0.015;
    }
    return 0;
  }

  // Apply caching discount: cached input tokens cost less
  const cached = cachedInputTokens || 0;
  const uncachedInput = Math.max(0, inTok - cached);
  const discountMultiplier = 1 - (pricing.cached_input_discount_pct / 100);

  const inputCost =
    (uncachedInput / 1000) * pricing.cost_per_1k_input +
    (cached / 1000) * pricing.cost_per_1k_input * discountMultiplier;

  // Apply batch discount to output if applicable
  const batchMultiplier = 1 - (pricing.batch_discount_pct / 100);
  const outputCost = (outTok / 1000) * pricing.cost_per_1k_output * batchMultiplier;

  return inputCost + outputCost;
}

export function invalidateCache(): void {
  lastRefresh = 0;
}
