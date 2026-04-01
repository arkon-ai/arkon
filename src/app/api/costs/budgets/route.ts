import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();
  const result = await query(`SELECT * FROM budget_limits ORDER BY created_at DESC`);
  return NextResponse.json({ budgets: result.rows });
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();
  const body = await req.json();
  const { scope_type, scope_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed, tenant_id } = body;

  if (!scope_type || !scope_id) {
    return NextResponse.json({ error: "scope_type and scope_id are required" }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO budget_limits (scope_type, scope_id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [scope_type, scope_id, daily_limit_usd || null, monthly_limit_usd || null, alert_threshold_pct || 80, action_on_exceed || "alert", tenant_id || "transformate"]
  );
  return NextResponse.json({ budget: result.rows[0] }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();
  const body = await req.json();
  const { id, daily_limit_usd, monthly_limit_usd, alert_threshold_pct, action_on_exceed } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const result = await query(
    `UPDATE budget_limits
     SET daily_limit_usd = $2, monthly_limit_usd = $3, alert_threshold_pct = $4, action_on_exceed = $5, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, daily_limit_usd || null, monthly_limit_usd || null, alert_threshold_pct || 80, action_on_exceed || "alert"]
  );

  if (result.rows.length === 0) return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  return NextResponse.json({ budget: result.rows[0] });
}

export async function DELETE(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await query(`DELETE FROM budget_limits WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
