import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isOwnerOrAdmin, unauthorized } from "@/app/api/tools/_utils";

/**
 * Validates that tenant_allocations object values sum to ~1.0 (tolerance 0.001).
 */
function validateAllocations(allocations: Record<string, unknown>): string | null {
  if (!allocations || typeof allocations !== "object") {
    return "tenant_allocations must be an object";
  }
  const values = Object.values(allocations);
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) {
    if (typeof v !== "number" || v < 0 || v > 1) {
      return "tenant_allocations values must be numbers between 0 and 1";
    }
    sum += v;
  }
  if (Math.abs(sum - 1.0) > 0.001) {
    return `tenant_allocations must sum to 1.0 (got ${sum.toFixed(3)})`;
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const result = await query(
      `SELECT id, name, category, monthly_cost_usd, currency, tenant_allocations, notes, active, created_at, updated_at
       FROM infra_costs
       ORDER BY active DESC, category, name`
    );

    // Aggregate totals
    const activeCosts = result.rows.filter((r) => r.active);
    const totalMonthly = activeCosts.reduce((sum, r) => sum + parseFloat(r.monthly_cost_usd), 0);

    // Per-tenant allocation totals
    const perTenant: Record<string, number> = {};
    for (const cost of activeCosts) {
      const allocations = cost.tenant_allocations || {};
      const amount = parseFloat(cost.monthly_cost_usd);
      for (const [tenant, pct] of Object.entries(allocations)) {
        perTenant[tenant] = (perTenant[tenant] || 0) + amount * (pct as number);
      }
    }

    return NextResponse.json({
      infra_costs: result.rows,
      total_monthly_usd: Math.round(totalMonthly * 100) / 100,
      per_tenant_monthly: Object.fromEntries(
        Object.entries(perTenant).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
    });
  } catch (err) {
    console.error("[admin/infra-costs] GET Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const { name, category, monthly_cost_usd, currency, tenant_allocations, notes, active } = body;

    if (!name || !category || monthly_cost_usd === undefined || monthly_cost_usd === null) {
      return NextResponse.json(
        { error: "name, category, and monthly_cost_usd required" },
        { status: 400 }
      );
    }

    const allocations = tenant_allocations || {};
    const allocationError = validateAllocations(allocations);
    if (allocationError) {
      return NextResponse.json({ error: allocationError }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO infra_costs (name, category, monthly_cost_usd, currency, tenant_allocations, notes, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        name,
        category,
        monthly_cost_usd,
        currency || "USD",
        JSON.stringify(allocations),
        notes || null,
        active !== false,
      ]
    );

    return NextResponse.json({ ok: true, infra_cost: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[admin/infra-costs] POST Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const { id, name, category, monthly_cost_usd, currency, tenant_allocations, notes, active } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    if (tenant_allocations !== undefined) {
      const allocationError = validateAllocations(tenant_allocations);
      if (allocationError) {
        return NextResponse.json({ error: allocationError }, { status: 400 });
      }
    }

    const result = await query(
      `UPDATE infra_costs
       SET name = COALESCE($2, name),
           category = COALESCE($3, category),
           monthly_cost_usd = COALESCE($4, monthly_cost_usd),
           currency = COALESCE($5, currency),
           tenant_allocations = COALESCE($6, tenant_allocations),
           notes = COALESCE($7, notes),
           active = COALESCE($8, active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        name ?? null,
        category ?? null,
        monthly_cost_usd ?? null,
        currency ?? null,
        tenant_allocations !== undefined ? JSON.stringify(tenant_allocations) : null,
        notes ?? null,
        active ?? null,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, infra_cost: result.rows[0] });
  } catch (err) {
    console.error("[admin/infra-costs] PUT Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param required" }, { status: 400 });
    }

    const result = await query(`DELETE FROM infra_costs WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted_id: result.rows[0].id });
  } catch (err) {
    console.error("[admin/infra-costs] DELETE Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
