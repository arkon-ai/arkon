import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

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
    };
  } catch (err) {
    checks.timescaledb = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  // Check events table accessible
  try {
    const start = Date.now();
    await query("SELECT COUNT(*) as count FROM events");
    checks.events_table = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    checks.events_table = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  // Check agents table accessible
  try {
    const start = Date.now();
    await query("SELECT COUNT(*) as count FROM agents");
    checks.agents_table = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    checks.agents_table = { ok: false, error: err instanceof Error ? err.message : "Query failed" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const statusCode = allOk ? 200 : 503;

  // Authenticated requests get full details
  const isAdmin = validateAdmin(req);
  if (isAdmin) {
    return NextResponse.json(
      {
        status: allOk ? "healthy" : "degraded",
        checks,
        uptime: process.uptime(),
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
