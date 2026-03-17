// src/app/api/benchmarks/compare/route.ts — Compare models side-by-side
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const url = new URL(req.url);
  const modelsParam = url.searchParams.get("models"); // comma-separated model_ids
  const promptHash = url.searchParams.get("prompt_hash");
  const range = url.searchParams.get("range") || "30d";

  const interval = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";

  try {
    let modelFilter = "";
    const params: (string | number)[] = [interval];

    if (modelsParam) {
      const models = modelsParam.split(",").map((m) => m.trim()).filter(Boolean);
      if (models.length > 0) {
        params.push(...models);
        const placeholders = models.map((_, i) => `$${i + 2}`).join(",");
        modelFilter = `AND model_id IN (${placeholders})`;
      }
    }

    const promptFilter = promptHash
      ? `AND prompt_hash = $${params.length + 1}`
      : "";
    if (promptHash) params.push(promptHash);

    // Per-model comparison
    const comparison = await query(
      `SELECT
        model_id,
        model_provider,
        COUNT(*)::int as runs,
        COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p50_latency_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p95_latency_ms,
        COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p99_latency_ms,
        COALESCE(MIN(latency_ms), 0)::int as min_latency_ms,
        COALESCE(MAX(latency_ms), 0)::int as max_latency_ms,
        COALESCE(AVG(quality_score), 0)::numeric(4,2) as avg_quality,
        COALESCE(MIN(quality_score), 0)::numeric(4,2) as min_quality,
        COALESCE(MAX(quality_score), 0)::numeric(4,2) as max_quality,
        COALESCE(AVG(cost_usd), 0)::numeric(10,6) as avg_cost,
        COALESCE(SUM(cost_usd), 0)::numeric(10,6) as total_cost,
        COALESCE(AVG(total_tokens), 0)::int as avg_tokens,
        COALESCE(AVG(input_tokens), 0)::int as avg_input_tokens,
        COALESCE(AVG(output_tokens), 0)::int as avg_output_tokens
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval ${modelFilter} ${promptFilter}
       GROUP BY model_id, model_provider
       ORDER BY avg_latency_ms ASC`,
      params
    );

    // Per-prompt breakdown (shared prompts across models)
    const promptParams: (string | number)[] = [interval];
    let promptModelFilter = "";
    if (modelsParam) {
      const models = modelsParam.split(",").map((m) => m.trim()).filter(Boolean);
      if (models.length > 0) {
        promptParams.push(...models);
        const placeholders = models.map((_, i) => `$${i + 2}`).join(",");
        promptModelFilter = `AND model_id IN (${placeholders})`;
      }
    }

    const byPrompt = await query(
      `SELECT
        prompt_hash,
        COALESCE(MAX(prompt_label), prompt_hash) as prompt_label,
        model_id,
        COUNT(*)::int as runs,
        COALESCE(AVG(latency_ms), 0)::int as avg_latency_ms,
        COALESCE(AVG(quality_score), 0)::numeric(4,2) as avg_quality,
        COALESCE(AVG(cost_usd), 0)::numeric(10,6) as avg_cost
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval ${promptModelFilter}
       GROUP BY prompt_hash, model_id
       ORDER BY prompt_hash, avg_latency_ms`,
      promptParams
    );

    // Available models list
    const availableModels = await query(
      `SELECT DISTINCT model_id, model_provider
       FROM benchmark_runs
       WHERE created_at > NOW() - $1::interval
       ORDER BY model_id`,
      [interval]
    );

    return NextResponse.json({
      comparison: comparison.rows,
      byPrompt: byPrompt.rows,
      availableModels: availableModels.rows,
      range,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[benchmarks/compare] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
