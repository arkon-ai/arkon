import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { invalidateCache } from "@/lib/pricing-cache";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  try {
    const result = await query(
      `SELECT * FROM model_pricing
       WHERE effective_from <= CURRENT_DATE
         AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ORDER BY provider, model_id`
    );

    return NextResponse.json({ pricing: result.rows });
  } catch (err) {
    console.error("[admin/pricing] GET Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  try {
    const body = await req.json();
    const { provider, model_id, display_name, cost_per_1k_input, cost_per_1k_output, is_free } = body;

    if (!provider || !model_id) {
      return NextResponse.json({ error: "provider and model_id required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO model_pricing (provider, model_id, display_name, cost_per_1k_input, cost_per_1k_output, is_free)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (provider, model_id, effective_from)
       DO UPDATE SET display_name = EXCLUDED.display_name,
                     cost_per_1k_input = EXCLUDED.cost_per_1k_input,
                     cost_per_1k_output = EXCLUDED.cost_per_1k_output,
                     is_free = EXCLUDED.is_free
       RETURNING *`,
      [provider, model_id, display_name || model_id, cost_per_1k_input || 0, cost_per_1k_output || 0, is_free || false]
    );

    invalidateCache();
    return NextResponse.json({ ok: true, pricing: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[admin/pricing] POST Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
