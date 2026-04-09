import { query } from "@/lib/db";
import { getAllPricing } from "@/lib/pricing-cache";

interface SubscriptionCost {
  provider: string;
  model_id: string;
  display_name: string;
  monthly_cost_usd: number;
  tokens_this_month: number;
  effective_cost_per_1k_input: number;
  effective_cost_per_1k_output: number;
}

/**
 * For subscription-priced models, calculates the effective per-token rate
 * by dividing monthly cost by actual tokens used this month.
 * Returns both the fixed monthly cost and the effective rate.
 */
export async function getSubscriptionCosts(): Promise<SubscriptionCost[]> {
  const allPricing = await getAllPricing();
  const subscriptions = allPricing.filter(p => p.pricing_type === "subscription" && p.monthly_cost_usd);

  if (subscriptions.length === 0) return [];

  const results: SubscriptionCost[] = [];

  for (const sub of subscriptions) {
    // Get total tokens for this provider this month from daily_stats via events metadata
    const tokenResult = await query(
      `SELECT COALESCE(SUM(token_estimate), 0) as total_tokens,
              COALESCE(SUM(input_tokens), 0) as total_input,
              COALESCE(SUM(output_tokens), 0) as total_output
       FROM events
       WHERE created_at >= date_trunc('month', CURRENT_DATE)
         AND metadata->>'provider' = $1
         AND (metadata->>'model' = $2 OR metadata->>'model' LIKE $3)`,
      [sub.provider, sub.model_id, `${sub.provider}/%`]
    );

    const totalTokens = parseInt(tokenResult.rows[0]?.total_tokens || "0");
    const totalInput = parseInt(tokenResult.rows[0]?.total_input || "0");
    const totalOutput = parseInt(tokenResult.rows[0]?.total_output || "0");
    const totalActual = totalInput + totalOutput;
    const tokens = totalActual > 0 ? totalActual : totalTokens;

    // Effective rate: monthly_cost / tokens * 1000 (per 1K tokens)
    // Split proportionally: assume 60/40 if no actual split available
    const inputRatio = totalActual > 0 ? totalInput / totalActual : 0.6;
    const outputRatio = totalActual > 0 ? totalOutput / totalActual : 0.4;

    let effectiveInputRate = 0;
    let effectiveOutputRate = 0;

    if (tokens > 0) {
      // Allocate monthly cost proportionally to input/output by their token counts
      const costPerToken = sub.monthly_cost_usd! / tokens;
      effectiveInputRate = costPerToken * 1000; // per 1K
      effectiveOutputRate = costPerToken * 1000; // same rate for subscription
    }

    results.push({
      provider: sub.provider,
      model_id: sub.model_id,
      display_name: sub.model_id,
      monthly_cost_usd: sub.monthly_cost_usd!,
      tokens_this_month: tokens,
      effective_cost_per_1k_input: Math.round(effectiveInputRate * 1000000) / 1000000,
      effective_cost_per_1k_output: Math.round(effectiveOutputRate * 1000000) / 1000000,
    });
  }

  return results;
}
