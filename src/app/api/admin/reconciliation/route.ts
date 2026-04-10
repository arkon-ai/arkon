import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isOwnerOrAdmin, unauthorized } from "@/app/api/tools/_utils";

/**
 * Calculates Arkon's tracked cost for a provider over a date range.
 * Provider filter works via model_pricing lookup — we match events whose
 * metadata.provider matches, falling back to daily_stats totals if no filter.
 */
async function getTrackedAmount(provider: string, periodStart: string, periodEnd: string): Promise<number> {
  // For providers with clear attribution (via metadata.provider), sum via events
  // Otherwise, sum all daily_stats in range (global reconciliation)
  const result = await query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN e.metadata->>'provider' = $1 THEN
           COALESCE(
             (e.input_tokens::numeric / 1000) * COALESCE(mp.cost_per_1k_input, 0) +
             (e.output_tokens::numeric / 1000) * COALESCE(mp.cost_per_1k_output, 0),
             0
           )
         ELSE 0
       END
     ), 0) as tracked
     FROM events e
     LEFT JOIN model_pricing mp ON mp.provider = e.metadata->>'provider'
       AND mp.model_id = e.metadata->>'model'
       AND mp.effective_from <= e.created_at::date
       AND (mp.effective_until IS NULL OR mp.effective_until >= e.created_at::date)
     WHERE e.created_at >= $2::date
       AND e.created_at < ($3::date + interval '1 day')`,
    [provider, periodStart, periodEnd]
  );
  return parseFloat(result.rows[0]?.tracked || "0");
}

export async function POST(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const body = await req.json();
    const { provider, period_start, period_end, invoice_amount_usd, notes, reconciled_by } = body;

    if (!provider || !period_start || !period_end || invoice_amount_usd === undefined) {
      return NextResponse.json(
        { error: "provider, period_start, period_end, invoice_amount_usd required" },
        { status: 400 }
      );
    }

    // Auto-calculate tracked amount from events
    const trackedAmount = await getTrackedAmount(provider, period_start, period_end);

    const result = await query(
      `INSERT INTO cost_reconciliation
         (provider, period_start, period_end, invoice_amount_usd, tracked_amount_usd, notes, reconciled_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [provider, period_start, period_end, invoice_amount_usd, trackedAmount, notes || null, reconciled_by || "admin"]
    );

    return NextResponse.json({ ok: true, reconciliation: result.rows[0] }, { status: 201 });
  } catch (err) {
    console.error("[admin/reconciliation] POST Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    const limit = parseInt(searchParams.get("limit") || "50");

    const whereClause = provider ? "WHERE provider = $1" : "";
    const params = provider ? [provider, limit] : [limit];
    const limitParam = provider ? "$2" : "$1";

    const result = await query(
      `SELECT * FROM cost_reconciliation
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limitParam}`,
      params
    );

    // Recent pricing audit entries (last 20)
    const auditResult = await query(
      `SELECT id, action, provider, model_id, changed_by, created_at
       FROM pricing_audit_log
       ORDER BY created_at DESC
       LIMIT 20`
    );

    // Cost accuracy score: % of events with actual token data (last 30d)
    const accuracyResult = await query(
      `SELECT
         COUNT(*) as total_events,
         COUNT(input_tokens) as events_with_actual_tokens
       FROM events
       WHERE created_at >= NOW() - interval '30 days'`
    );
    const totalEvents = parseInt(accuracyResult.rows[0]?.total_events || "0");
    const eventsWithActual = parseInt(accuracyResult.rows[0]?.events_with_actual_tokens || "0");
    const accuracyPct = totalEvents > 0 ? Math.round((eventsWithActual / totalEvents) * 100) : 0;

    return NextResponse.json({
      reconciliations: result.rows.map((r: Record<string, unknown>) => ({
        ...r,
        invoice_amount_usd: parseFloat(String(r.invoice_amount_usd)),
        tracked_amount_usd: parseFloat(String(r.tracked_amount_usd)),
        variance_usd: parseFloat(String(r.variance_usd)),
        variance_pct: parseFloat(String(r.variance_pct)),
      })),
      recent_audit: auditResult.rows,
      accuracy: {
        total_events_30d: totalEvents,
        events_with_actual_tokens: eventsWithActual,
        accuracy_pct: accuracyPct,
      },
    });
  } catch (err) {
    console.error("[admin/reconciliation] GET Error:", err);
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

    const result = await query(
      `DELETE FROM cost_reconciliation WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deleted_id: result.rows[0].id });
  } catch (err) {
    console.error("[admin/reconciliation] DELETE Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
