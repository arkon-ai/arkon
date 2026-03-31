import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateRole, unauthorized, parseInteger } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces — List traces with filters.
 * Query: agent_id, status, from, to, min_duration, max_duration, limit, offset, q
 *
 * POST /api/traces — Ingest a new trace (+ optional spans).
 * Body: { name, agent_id, tenant_id, status, duration_ms, token_count, cost, started_at, ended_at, metadata, spans[] }
 */
export async function GET(req: NextRequest) {
  const role = await validateRole(req, "viewer");
  if (!role) return unauthorized();

  const params = req.nextUrl.searchParams;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 0;

  const agentId = params.get("agent_id");
  if (agentId) { idx++; conditions.push(`agent_id = $${idx}`); values.push(agentId); }

  const status = params.get("status");
  if (status) { idx++; conditions.push(`status = $${idx}`); values.push(status); }

  const tenantId = params.get("tenant_id");
  if (tenantId) { idx++; conditions.push(`tenant_id = $${idx}`); values.push(tenantId); }

  const from = params.get("from");
  if (from) { idx++; conditions.push(`started_at >= $${idx}`); values.push(from); }

  const to = params.get("to");
  if (to) { idx++; conditions.push(`started_at <= $${idx}`); values.push(to); }

  const minDuration = params.get("min_duration");
  if (minDuration) { idx++; conditions.push(`duration_ms >= $${idx}`); values.push(parseInt(minDuration, 10)); }

  const maxDuration = params.get("max_duration");
  if (maxDuration) { idx++; conditions.push(`duration_ms <= $${idx}`); values.push(parseInt(maxDuration, 10)); }

  const search = params.get("q");
  if (search) { idx++; conditions.push(`(name ILIKE $${idx} OR agent_id ILIKE $${idx})`); values.push(`%${search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(parseInteger(params.get("limit"), 50), 200);
  const offset = parseInteger(params.get("offset"), 0);

  idx++; const limitIdx = idx; values.push(limit);
  idx++; const offsetIdx = idx; values.push(offset);

  try {
    const [data, countResult] = await Promise.all([
      query(
        `SELECT trace_id, agent_id, tenant_id, name, status, duration_ms,
                token_count, cost, started_at, ended_at, metadata,
                (SELECT COUNT(*)::int FROM spans s WHERE s.trace_id = t.trace_id) AS span_count
         FROM traces t ${where}
         ORDER BY started_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values
      ),
      query(`SELECT COUNT(*)::int as total FROM traces t ${where}`, values.slice(0, -2)),
    ]);

    return NextResponse.json({
      traces: data.rows,
      total: (countResult.rows[0] as { total: number }).total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[traces] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const role = await validateRole(req, "agent");
  if (!role) return unauthorized();

  try {
    const body = await req.json();
    const {
      name, agent_id, tenant_id, status = "ok", duration_ms, token_count = 0,
      cost = 0, started_at, ended_at, metadata = {}, spans = [],
    } = body as {
      name?: string; agent_id?: string; tenant_id?: string; status?: string;
      duration_ms?: number; token_count?: number; cost?: number;
      started_at?: string; ended_at?: string; metadata?: Record<string, unknown>;
      spans?: Array<{
        name?: string; parent_span_id?: string; type?: string; status?: string;
        duration_ms?: number; token_count?: number; cost?: number;
        input?: unknown; output?: unknown; metadata?: Record<string, unknown>;
        error?: string; started_at?: string; ended_at?: string;
      }>;
    };

    const traceResult = await query(
      `INSERT INTO traces (name, agent_id, tenant_id, status, duration_ms, token_count, cost, started_at, ended_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING trace_id, started_at`,
      [name, agent_id, tenant_id, status, duration_ms, token_count, cost,
       started_at || new Date().toISOString(), ended_at, JSON.stringify(metadata)]
    );

    const traceId = (traceResult.rows[0] as { trace_id: string }).trace_id;

    // Insert spans if provided
    if (spans.length > 0) {
      for (const span of spans) {
        await query(
          `INSERT INTO spans (trace_id, parent_span_id, name, type, status, duration_ms, token_count, cost, input, output, metadata, error, started_at, ended_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            traceId, span.parent_span_id || null, span.name, span.type || "chain",
            span.status || "ok", span.duration_ms, span.token_count || 0,
            span.cost || 0, span.input ? JSON.stringify(span.input) : null,
            span.output ? JSON.stringify(span.output) : null,
            JSON.stringify(span.metadata || {}), span.error || null,
            span.started_at || started_at || new Date().toISOString(),
            span.ended_at || null,
          ]
        );
      }
    }

    return NextResponse.json({ trace_id: traceId, spans_inserted: spans.length }, { status: 201 });
  } catch (err) {
    console.error("[traces] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
