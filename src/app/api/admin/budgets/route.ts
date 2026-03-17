import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  try {
    const result = await query(
      `SELECT bl.*,
              COALESCE((SELECT SUM(estimated_cost_usd) FROM daily_stats
                        WHERE day = CURRENT_DATE
                        AND (bl.scope_type = 'tenant' AND tenant_id = bl.scope_id
                             OR bl.scope_type = 'agent' AND agent_id = bl.scope_id)), 0)::numeric as today_spend,
              COALESCE((SELECT SUM(estimated_cost_usd) FROM daily_stats
                        WHERE day >= date_trunc('month', CURRENT_DATE)
                        AND (bl.scope_type = 'tenant' AND tenant_id = bl.scope_id
                             OR bl.scope_type = 'agent' AND agent_id = bl.scope_id)), 0)::numeric as month_spend
       FROM budget_limits bl
       ORDER BY bl.created_at DESC`
    );

    return NextResponse.json({ budgets: result.rows });
  } catch (err) {
    console.error("[admin/budgets] GET Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  try {
    const body = await req.json();
    const { scope_type, scope_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed, tenant_id } = body;

    if (!scope_type || !scope_id) {
      return NextResponse.json({ error: "scope_type and scope_id required" }, { status: 400 });
    }
    if (!["tenant", "agent"].includes(scope_type)) {
      return NextResponse.json({ error: "scope_type must be 'tenant' or 'agent'" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO budget_limits (scope_type, scope_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        scope_type,
        scope_id,
        daily_limit_usd || null,
        monthly_limit_usd || null,
        alert_threshold_pct || 80,
        action_on_exceed || "alert",
        tenant_id || "transformate",
      ]
    );

    return NextResponse.json({ ok: true, budget: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[admin/budgets] POST Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  try {
    const body = await req.json();
    const { id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const result = await query(
      `UPDATE budget_limits SET
         daily_limit_usd = COALESCE($2, daily_limit_usd),
         monthly_limit_usd = COALESCE($3, monthly_limit_usd),
         alert_threshold_pct = COALESCE($4, alert_threshold_pct),
         action_on_exceed = COALESCE($5, action_on_exceed),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Budget not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, budget: result.rows[0] });
  } catch (err) {
    console.error("[admin/budgets] PUT Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await query("DELETE FROM budget_limits WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/budgets] DELETE Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
