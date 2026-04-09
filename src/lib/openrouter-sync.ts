import { query } from "@/lib/db";
import { invalidateCache } from "@/lib/pricing-cache";

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
}

interface SyncResult {
  added: number;
  updated: number;
  unchanged: number;
  total_fetched: number;
  errors: string[];
}

/**
 * Fetches model pricing from OpenRouter's public API and upserts into model_pricing.
 * Prices from OpenRouter are per-token; we convert to per-1K tokens for our schema.
 */
export async function syncOpenRouterPricing(): Promise<SyncResult> {
  const result: SyncResult = { added: 0, updated: 0, unchanged: 0, total_fetched: 0, errors: [] };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      result.errors.push(`OpenRouter API returned ${response.status}`);
      return result;
    }

    const data = await response.json();
    const models: OpenRouterModel[] = data.data || [];
    result.total_fetched = models.length;

    for (const model of models) {
      if (!model.pricing) continue;

      const promptPerToken = parseFloat(model.pricing.prompt || "0");
      const completionPerToken = parseFloat(model.pricing.completion || "0");

      // Convert per-token to per-1K tokens
      const costPer1kInput = promptPerToken * 1000;
      const costPer1kOutput = completionPerToken * 1000;
      const isFree = costPer1kInput === 0 && costPer1kOutput === 0;

      // Calculate caching discount if input_cache_read is available
      let cachedDiscount = 0;
      if (model.pricing.input_cache_read && promptPerToken > 0) {
        const cacheReadPerToken = parseFloat(model.pricing.input_cache_read);
        cachedDiscount = Math.round((1 - cacheReadPerToken / promptPerToken) * 100 * 100) / 100;
        if (cachedDiscount < 0) cachedDiscount = 0;
      }

      // Extract provider from model ID (e.g., "anthropic/claude-sonnet-4-6" -> "openrouter")
      // We use "openrouter" as the provider to avoid conflicts with direct API entries
      const provider = "openrouter";
      const modelId = model.id; // Keep full ID like "anthropic/claude-sonnet-4-6"
      const displayName = model.name || model.id;

      try {
        // Check if this model already exists with same pricing
        const existing = await query(
          `SELECT id, cost_per_1k_input, cost_per_1k_output, cached_input_discount_pct
           FROM model_pricing
           WHERE provider = $1 AND model_id = $2
             AND effective_from <= CURRENT_DATE
             AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
           ORDER BY effective_from DESC LIMIT 1`,
          [provider, modelId]
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const existingInput = parseFloat(row.cost_per_1k_input);
          const existingOutput = parseFloat(row.cost_per_1k_output);
          const existingDiscount = parseFloat(row.cached_input_discount_pct);

          // Check if pricing changed (within small tolerance for float comparison)
          const inputChanged = Math.abs(existingInput - costPer1kInput) > 0.000001;
          const outputChanged = Math.abs(existingOutput - costPer1kOutput) > 0.000001;
          const discountChanged = Math.abs(existingDiscount - cachedDiscount) > 0.01;

          if (inputChanged || outputChanged || discountChanged) {
            // Set effective_until on old row
            await query(
              `UPDATE model_pricing SET effective_until = CURRENT_DATE - 1
               WHERE id = $1`,
              [row.id]
            );

            // Insert new row with current pricing
            await query(
              `INSERT INTO model_pricing (provider, model_id, display_name, cost_per_1k_input, cost_per_1k_output, is_free, pricing_type, cached_input_discount_pct)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [provider, modelId, displayName, costPer1kInput, costPer1kOutput, isFree, isFree ? "free" : "per_token", cachedDiscount]
            );
            result.updated++;
          } else {
            result.unchanged++;
          }
        } else {
          // New model — insert
          await query(
            `INSERT INTO model_pricing (provider, model_id, display_name, cost_per_1k_input, cost_per_1k_output, is_free, pricing_type, cached_input_discount_pct)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [provider, modelId, displayName, costPer1kInput, costPer1kOutput, isFree, isFree ? "free" : "per_token", cachedDiscount]
          );
          result.added++;
        }
      } catch (err) {
        result.errors.push(`${modelId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Invalidate pricing cache after sync
    invalidateCache();

    // Record sync timestamp
    await query(
      `INSERT INTO model_pricing (provider, model_id, display_name, cost_per_1k_input, cost_per_1k_output, is_free, pricing_type, notes)
       VALUES ('_system', '_openrouter_sync', 'Last OpenRouter Sync', 0, 0, true, 'free', $1)
       ON CONFLICT (provider, model_id, effective_from)
       DO UPDATE SET notes = $1`,
      [JSON.stringify({ synced_at: new Date().toISOString(), ...result })]
    );

  } catch (err) {
    result.errors.push(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
