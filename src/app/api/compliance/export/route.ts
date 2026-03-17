// src/app/api/compliance/export/route.ts — Data export (CSV/JSON)
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const url = new URL(req.url);
  const dataType = url.searchParams.get("type") || "events"; // events, costs, agents, audit_log, benchmarks
  const format = url.searchParams.get("format") || "json"; // json, csv
  const tenantId = url.searchParams.get("tenant_id");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "10000"), 50000);

  try {
    let sql = "";
    const params: unknown[] = [];
    let idx = 1;

    switch (dataType) {
      case "events": {
        const conditions: string[] = [];
        if (tenantId) {
          conditions.push(`e.agent_id IN (SELECT id FROM agents WHERE tenant_id = $${idx++})`);
          params.push(tenantId);
        }
        if (since) { conditions.push(`e.created_at >= $${idx++}`); params.push(since); }
        if (until) { conditions.push(`e.created_at <= $${idx++}`); params.push(until); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        sql = `SELECT e.id, e.agent_id, e.event_type, e.direction, e.session_key, e.channel_id,
                      e.sender, e.content_redacted as content, e.token_estimate,
                      e.threat_level, e.created_at
               FROM events e ${where}
               ORDER BY e.created_at DESC LIMIT $${idx++}`;
        params.push(limit);
        break;
      }
      case "costs": {
        const conditions: string[] = [];
        if (tenantId) { conditions.push(`ds.tenant_id = $${idx++}`); params.push(tenantId); }
        if (since) { conditions.push(`ds.day >= $${idx++}::date`); params.push(since); }
        if (until) { conditions.push(`ds.day <= $${idx++}::date`); params.push(until); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        sql = `SELECT ds.agent_id, a.name as agent_name, ds.day,
                      ds.messages_received, ds.messages_sent, ds.tool_calls, ds.errors,
                      ds.estimated_tokens, ds.estimated_cost_usd, ds.tenant_id
               FROM daily_stats ds
               LEFT JOIN agents a ON a.id = ds.agent_id
               ${where}
               ORDER BY ds.day DESC LIMIT $${idx++}`;
        params.push(limit);
        break;
      }
      case "agents": {
        const conditions: string[] = [];
        if (tenantId) { conditions.push(`a.tenant_id = $${idx++}`); params.push(tenantId); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        sql = `SELECT a.id, a.name, a.role, a.tenant_id, a.created_at, a.updated_at,
                      COALESCE(
                        (SELECT SUM(ds.messages_received + ds.messages_sent) FROM daily_stats ds WHERE ds.agent_id = a.id),
                        0
                      )::int as total_messages,
                      COALESCE(
                        (SELECT SUM(ds.estimated_cost_usd) FROM daily_stats ds WHERE ds.agent_id = a.id),
                        0
                      ) as total_cost
               FROM agents a ${where}
               ORDER BY a.name LIMIT $${idx++}`;
        params.push(limit);
        break;
      }
      case "audit_log": {
        const conditions: string[] = [];
        if (tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(tenantId); }
        if (since) { conditions.push(`created_at >= $${idx++}`); params.push(since); }
        if (until) { conditions.push(`created_at <= $${idx++}`); params.push(until); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        sql = `SELECT id, actor, action, resource_type, resource_id, detail, ip_address, tenant_id, created_at
               FROM audit_log ${where}
               ORDER BY created_at DESC LIMIT $${idx++}`;
        params.push(limit);
        break;
      }
      case "benchmarks": {
        const conditions: string[] = [];
        if (tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(tenantId); }
        if (since) { conditions.push(`created_at >= $${idx++}`); params.push(since); }
        if (until) { conditions.push(`created_at <= $${idx++}`); params.push(until); }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        sql = `SELECT id, model_id, model_provider, prompt_hash, prompt_label,
                      latency_ms, input_tokens, output_tokens, total_tokens,
                      cost_usd, quality_score, agent_id, tenant_id, created_at
               FROM benchmark_runs ${where}
               ORDER BY created_at DESC LIMIT $${idx++}`;
        params.push(limit);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown data type: ${dataType}` }, { status: 400 });
    }

    const result = await query(sql, params);
    const rows = result.rows as Record<string, unknown>[];

    if (format === "csv") {
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${dataType}_export_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      type: dataType,
      count: rows.length,
      data: rows,
      exported_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[compliance/export] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
