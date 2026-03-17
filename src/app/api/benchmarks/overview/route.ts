// src/app/api/benchmarks/overview/route.ts — Benchmark overview stats
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const tenantId = url.searchParams.get("tenant_id");

  const interval = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";
  const tenantFilter = tenantId ? "AND tenant_id = $2" : "";
  const params: (string | number)[] = [interval];
  if (tenantId) params.push(tenantId);

  try {
    // Summary stats
    const summary = await query(
      `SELECT
        COUNT(*)::int as total_runs,
        COUNT(DISTINCT model_id)::int as models_tested,
        COUNT(DISTINCT prompt_hash)::int as unique_prompts,
        COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
        COALESCE(AVG(quality_score), 0)::numeric(4,2) as avg_quality,
        COALESCE(SUM(cost_usd), 0)::numeric(10,6) as total_cost,
        COALESCE(SUM(total_tokens), 0)::bigint as total_tokens
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval ${tenantFilter}`,
      params
    );

    // Per-model breakdown
    const byModel = await query(
      `SELECT
        model_id,
        model_provider,
        COUNT(*)::int as runs,
        COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
        COALESCE(MIN(latency_ms), 0)::int as min_latency_ms,
        COALESCE(MAX(latency_ms), 0)::int as max_latency_ms,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p50_latency_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p95_latency_ms,
        COALESCE(AVG(quality_score), 0)::numeric(4,2) as avg_quality,
        COALESCE(AVG(cost_usd), 0)::numeric(10,6) as avg_cost,
        COALESCE(SUM(cost_usd), 0)::numeric(10,6) as total_cost,
        COALESCE(AVG(total_tokens), 0)::int as avg_tokens,
        COALESCE(AVG(output_tokens), 0)::int as avg_output_tokens
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval ${tenantFilter}
       GROUP BY model_id, model_provider
       ORDER BY avg_latency_ms ASC`,
      params
    );

    // Daily trend
    const dailyTrend = await query(
      `SELECT
        DATE(created_at) as day,
        COUNT(*)::int as runs,
        COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
        COALESCE(AVG(quality_score), 0)::numeric(4,2) as avg_quality,
        COALESCE(SUM(cost_usd), 0)::numeric(10,6) as cost
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval ${tenantFilter}
       GROUP BY DATE(created_at)
       ORDER BY day`,
      params
    );

    // Recent runs
    const recent = await query(
      `SELECT id, model_id, model_provider, prompt_label, latency_ms,
              total_tokens, cost_usd, quality_score, created_at
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval ${tenantFilter}
       ORDER BY created_at DESC
       LIMIT 20`,
      params
    );

    return NextResponse.json({
      summary: summary.rows[0],
      byModel: byModel.rows,
      dailyTrend: dailyTrend.rows,
      recent: recent.rows,
      range,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[benchmarks/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Record a new benchmark run
export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = (await req.json()) as {
      model_id: string;
      model_provider?: string;
      prompt_hash: string;
      prompt_label?: string;
      latency_ms: number;
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      cost_usd?: number;
      quality_score?: number;
      agent_id?: string;
      tenant_id?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.model_id || !body.prompt_hash || body.latency_ms === undefined) {
      return NextResponse.json(
        { error: "model_id, prompt_hash, and latency_ms are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO benchmark_runs
        (model_id, model_provider, prompt_hash, prompt_label, latency_ms,
         input_tokens, output_tokens, total_tokens, cost_usd, quality_score,
         agent_id, tenant_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        body.model_id,
        body.model_provider ?? "unknown",
        body.prompt_hash,
        body.prompt_label ?? null,
        body.latency_ms,
        body.input_tokens ?? 0,
        body.output_tokens ?? 0,
        body.total_tokens ?? (body.input_tokens ?? 0) + (body.output_tokens ?? 0),
        body.cost_usd ?? 0,
        body.quality_score ?? null,
        body.agent_id ?? null,
        body.tenant_id ?? "transformate",
        JSON.stringify(body.metadata ?? {}),
      ]
    );

    return NextResponse.json({ run: result.rows[0], ok: true }, { status: 201 });
  } catch (err) {
    console.error("[benchmarks/overview] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
