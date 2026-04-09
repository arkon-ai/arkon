import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const interval = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";

  try {
    // Model usage from events metadata — now with actual input/output token columns
    const byModel = await query(
      `SELECT
         COALESCE(metadata->>'provider', 'unknown') as provider,
         COALESCE(metadata->>'model', 'unknown') as model,
         COUNT(*) as event_count,
         COALESCE(SUM(token_estimate), 0) as total_tokens,
         COALESCE(SUM(input_tokens), 0) as total_input_tokens,
         COALESCE(SUM(output_tokens), 0) as total_output_tokens,
         COUNT(input_tokens) as events_with_actual_tokens
       FROM events
       WHERE created_at >= NOW() - $1::interval
         AND metadata IS NOT NULL
       GROUP BY provider, model
       ORDER BY total_tokens DESC`,
      [interval]
    );

    // Join with pricing to get costs
    const pricing = await query(
      `SELECT provider, model_id, display_name, cost_per_1k_input, cost_per_1k_output, is_free
       FROM model_pricing
       WHERE effective_from <= CURRENT_DATE
         AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)`
    );

    const priceMap = new Map<string, { input: number; output: number; free: boolean; name: string }>();
    for (const p of pricing.rows) {
      priceMap.set(`${p.provider}::${p.model_id}`, {
        input: parseFloat(p.cost_per_1k_input),
        output: parseFloat(p.cost_per_1k_output),
        free: p.is_free,
        name: p.display_name || p.model_id,
      });
    }

    const models = byModel.rows.map((r: Record<string, string>) => {
      const tokens = parseInt(r.total_tokens);
      const actualInputTokens = parseInt(r.total_input_tokens);
      const actualOutputTokens = parseInt(r.total_output_tokens);
      const hasActualTokens = actualInputTokens > 0 || actualOutputTokens > 0;

      const price = priceMap.get(`${r.provider}::${r.model}`) ||
                    priceMap.get(`anthropic::claude-sonnet-4-6`);

      // Use actual token split when available, fall back to 60/40
      const inputTokens = hasActualTokens ? actualInputTokens : tokens * 0.6;
      const outputTokens = hasActualTokens ? actualOutputTokens : tokens * 0.4;

      const cost = price && !price.free
        ? (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output
        : 0;

      return {
        provider: r.provider,
        model: r.model,
        display_name: price?.name || r.model,
        event_count: parseInt(r.event_count),
        total_tokens: tokens,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        has_actual_tokens: hasActualTokens,
        events_with_actual_tokens: parseInt(r.events_with_actual_tokens),
        estimated_cost: Math.round(cost * 10000) / 10000,
        is_free: price?.free || false,
      };
    });

    return NextResponse.json({ range, models });
  } catch (err) {
    console.error("[costs/by-model] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
