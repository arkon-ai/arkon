import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateRole, unauthorized } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces/[traceId] — Get a single trace with all its spans.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const role = await validateRole(req, "viewer");
  if (!role) return unauthorized();

  const { traceId } = await params;

  try {
    const traceResult = await query(
      `SELECT trace_id, agent_id, tenant_id, name, status, duration_ms,
              token_count, cost, started_at, ended_at, metadata
       FROM traces WHERE trace_id = $1 LIMIT 1`,
      [traceId]
    );

    if (traceResult.rows.length === 0) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    const spansResult = await query(
      `SELECT span_id, parent_span_id, name, type, status, duration_ms,
              token_count, cost, input, output, metadata, error, started_at, ended_at
       FROM spans WHERE trace_id = $1 ORDER BY started_at ASC`,
      [traceId]
    );

    return NextResponse.json({
      trace: traceResult.rows[0],
      spans: spansResult.rows,
    });
  } catch (err) {
    console.error("[traces] GET detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
