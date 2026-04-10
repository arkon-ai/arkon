import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isOwnerOrAdmin, unauthorized } from "@/app/api/tools/_utils";
import { invalidateCache } from "@/lib/pricing-cache";
import { getSubscriptionCosts } from "@/lib/subscription-amortize";

export async function GET(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const result = await query(
      `SELECT * FROM model_pricing
       WHERE effective_from <= CURRENT_DATE
         AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ORDER BY provider, model_id`
    );

    // Include subscription effective rates
    const subscriptions = await getSubscriptionCosts();

    return NextResponse.json({ pricing: result.rows, subscriptions });
  } catch (err) {
    console.error("[admin/pricing] GET Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const {
      provider, model_id, display_name,
      cost_per_1k_input, cost_per_1k_output, is_free,
      pricing_type, monthly_cost_usd,
      cached_input_discount_pct, batch_discount_pct, notes
    } = body;

    if (!provider || !model_id) {
      return NextResponse.json({ error: "provider and model_id required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO model_pricing (
        provider, model_id, display_name,
        cost_per_1k_input, cost_per_1k_output, is_free,
        pricing_type, monthly_cost_usd,
        cached_input_discount_pct, batch_discount_pct, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (provider, model_id, effective_from)
       DO UPDATE SET display_name = EXCLUDED.display_name,
                     cost_per_1k_input = EXCLUDED.cost_per_1k_input,
                     cost_per_1k_output = EXCLUDED.cost_per_1k_output,
                     is_free = EXCLUDED.is_free,
                     pricing_type = EXCLUDED.pricing_type,
                     monthly_cost_usd = EXCLUDED.monthly_cost_usd,
                     cached_input_discount_pct = EXCLUDED.cached_input_discount_pct,
                     batch_discount_pct = EXCLUDED.batch_discount_pct,
                     notes = EXCLUDED.notes
       RETURNING *`,
      [
        provider,
        model_id,
        display_name || model_id,
        cost_per_1k_input || 0,
        cost_per_1k_output || 0,
        is_free || false,
        pricing_type || "per_token",
        monthly_cost_usd || null,
        cached_input_discount_pct || 0,
        batch_discount_pct || 0,
        notes || null,
      ]
    );

    invalidateCache();
    return NextResponse.json({ ok: true, pricing: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[admin/pricing] POST Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
