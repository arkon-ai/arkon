import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin } from "@/app/api/tools/_utils";
import * as os from "os";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string; detail?: unknown }> = {};

  // Check PostgreSQL connection
  try {
    const start = Date.now();
    const result = await query("SELECT 1 as check, current_timestamp as ts");
    checks.postgres = { ok: result.rows.length > 0, latencyMs: Date.now() - start };
  } catch (err) {
    checks.postgres = { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }

  // Check TimescaleDB extension
  try {
    const start = Date.now();
    const result = await query("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'");
    checks.timescaledb = {
      ok: result.rows.length > 0,
      latencyMs: Date.now() - start,
      detail: result.rows[0] ?? null,
    };
  } catch (err) {
    checks.timescaledb = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  // Check events table accessible
  try {
    const start = Date.now();
    const result = await query("SELECT COUNT(*)::int as count FROM events");
    checks.events_table = { ok: true, latencyMs: Date.now() - start, detail: result.rows[0] };
  } catch (err) {
    checks.events_table = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  // Check agents table accessible
  try {
    const start = Date.now();
    const result = await query("SELECT COUNT(*)::int as count FROM agents");
    checks.agents_table = { ok: true, latencyMs: Date.now() - start, detail: result.rows[0] };
  } catch (err) {
    checks.agents_table = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  // Check users table (Phase 3)
  try {
    const start = Date.now();
    const result = await query("SELECT COUNT(*)::int as count FROM users");
    checks.users_table = { ok: true, latencyMs: Date.now() - start, detail: result.rows[0] };
  } catch (err) {
    checks.users_table = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  // Check last data collection timestamps
  try {
    const start = Date.now();
    const result = await query(`
      SELECT
        (SELECT MAX(created_at) FROM events) as last_event,
        (SELECT MAX(time) FROM node_metrics) as last_metric,
        (SELECT MAX(created_at) FROM audit_log_v2) as last_audit
    `);
    checks.data_freshness = {
      ok: true,
      latencyMs: Date.now() - start,
      detail: result.rows[0],
    };
  } catch (err) {
    checks.data_freshness = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const statusCode = allOk ? 200 : 503;

  // Authenticated requests get full details
  const isAdmin = validateAdmin(req);
  if (isAdmin) {
    // System info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();

    return NextResponse.json(
      {
        status: allOk ? "healthy" : "degraded",
        checks,
        system: {
          uptime: process.uptime(),
          memory: {
            total_mb: Math.round(totalMem / 1048576),
            free_mb: Math.round(freeMem / 1048576),
            used_pct: Math.round(((totalMem - freeMem) / totalMem) * 100),
          },
          load_avg: loadAvg.map((l) => Math.round(l * 100) / 100),
          node_version: process.version,
        },
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "unknown",
      },
      { status: statusCode, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Unauthenticated: minimal info only
  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded" },
    { status: statusCode, headers: { "Cache-Control": "no-store" } }
  );
}
