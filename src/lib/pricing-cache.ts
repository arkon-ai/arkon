import { query } from "@/lib/db";

interface PricingEntry {
  provider: string;
  model_id: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  is_free: boolean;
}

let cache: Map<string, PricingEntry> = new Map();
let lastRefresh = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheKey(provider: string, modelId: string): string {
  return `${provider}::${modelId}`;
}

async function refreshCache(): Promise<void> {
  try {
    const result = await query(
      `SELECT provider, model_id, cost_per_1k_input, cost_per_1k_output, is_free
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
        });
      }
    }
    cache = fresh;
    lastRefresh = Date.now();
  } catch (err) {
    console.error("[pricing-cache] refresh failed:", err);
  }
}

export async function getPricing(provider: string, modelId: string): Promise<PricingEntry | null> {
  if (Date.now() - lastRefresh > CACHE_TTL_MS || cache.size === 0) {
    await refreshCache();
  }
  return cache.get(cacheKey(provider, modelId)) || null;
}

export async function getAllPricing(): Promise<PricingEntry[]> {
  if (Date.now() - lastRefresh > CACHE_TTL_MS || cache.size === 0) {
    await refreshCache();
  }
  return Array.from(cache.values());
}

/**
 * Estimate cost for an event.
 * When actual input_tokens and output_tokens are provided, uses them directly.
 * Otherwise falls back to 60/40 split of tokenEstimate (legacy path).
 * Returns cost in USD.
 */
export async function estimateCost(
  tokenEstimate: number,
  metadata?: Record<string, unknown>,
  inputTokens?: number,
  outputTokens?: number
): Promise<number> {
  const hasActualTokens = typeof inputTokens === "number" && typeof outputTokens === "number"
    && (inputTokens > 0 || outputTokens > 0);

  if (!hasActualTokens && (!tokenEstimate || tokenEstimate <= 0)) return 0;

  const provider = (metadata?.provider as string) || "anthropic";
  const model = (metadata?.model as string) || "claude-sonnet-4-6";

  const pricing = await getPricing(provider, model);

  if (pricing && pricing.is_free) return 0;

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
    // Fallback: assume Anthropic Sonnet rates
    return (inTok / 1000) * 0.003 + (outTok / 1000) * 0.015;
  }

  return (inTok / 1000) * pricing.cost_per_1k_input +
         (outTok / 1000) * pricing.cost_per_1k_output;
}

export function invalidateCache(): void {
  lastRefresh = 0;
}
