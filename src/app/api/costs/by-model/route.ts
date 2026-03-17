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
    // Model usage from events metadata (where provider/model fields exist)
    const byModel = await query(
      `SELECT
         COALESCE(metadata->>'provider', 'unknown') as provider,
         COALESCE(metadata->>'model', 'unknown') as model,
         COUNT(*) as event_count,
         COALESCE(SUM(token_estimate), 0) as total_tokens
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
      const price = priceMap.get(`${r.provider}::${r.model}`) ||
                    priceMap.get(`anthropic::claude-sonnet-4-6`);
      const inputTokens = tokens * 0.6;
      const outputTokens = tokens * 0.4;
      const cost = price && !price.free
        ? (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output
        : 0;

      return {
        provider: r.provider,
        model: r.model,
        display_name: price?.name || r.model,
        event_count: parseInt(r.event_count),
        total_tokens: tokens,
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
