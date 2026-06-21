// src/app/api/compliance/purge/route.ts — GDPR data purge
import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = (await req.json()) as {
      scope: "tenant" | "agent";
      scope_id: string;
      confirm: boolean;
      dry_run?: boolean;
    };

    if (!body.scope || !body.scope_id) {
      return NextResponse.json(
        { error: "scope (tenant|agent) and scope_id are required" },
        { status: 400 }
      );
    }

    if (!body.confirm) {
      return NextResponse.json(
        { error: "Must set confirm: true to execute purge" },
        { status: 400 }
      );
    }

    const dryRun = body.dry_run ?? false;
    const results: Record<string, number> = {};

    if (body.scope === "tenant") {
      // Count affected rows
      const agentIds = await query(
        `SELECT id FROM agents WHERE tenant_id = $1`, [body.scope_id]
      );
      const ids = agentIds.rows.map((r: Record<string, string>) => r.id);

      if (ids.length > 0) {
        const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(",");

        const eventCount = await query(
          `SELECT COUNT(*)::int as c FROM events WHERE agent_id IN (${placeholders})`, ids
        );
        results.events = eventCount.rows[0]?.c ?? 0;

        const sessionCount = await query(
          `SELECT COUNT(*)::int as c FROM sessions WHERE agent_id IN (${placeholders})`, ids
        );
        results.sessions = sessionCount.rows[0]?.c ?? 0;

        const statsCount = await query(
          `SELECT COUNT(*)::int as c FROM daily_stats WHERE agent_id IN (${placeholders})`, ids
        );
        results.daily_stats = statsCount.rows[0]?.c ?? 0;

        const benchCount = await query(
          `SELECT COUNT(*)::int as c FROM benchmark_runs WHERE tenant_id = $1`, [body.scope_id]
        );
        results.benchmark_runs = benchCount.rows[0]?.c ?? 0;

        const auditCount = await query(
          `SELECT COUNT(*)::int as c FROM audit_log WHERE tenant_id = $1`, [body.scope_id]
        );
        results.audit_log = auditCount.rows[0]?.c ?? 0;

        const wfRunsCount = await query(
          `SELECT COUNT(*)::int as c FROM workflow_runs WHERE tenant_id = $1`, [body.scope_id]
        );
        results.workflow_runs = wfRunsCount.rows[0]?.c ?? 0;

        const wfCount = await query(
          `SELECT COUNT(*)::int as c FROM workflows WHERE tenant_id = $1`, [body.scope_id]
        );
        results.workflows = wfCount.rows[0]?.c ?? 0;

        results.agents = ids.length;

        if (!dryRun) {
          // Single transaction so a mid-chain failure cannot leave a tenant
          // partially purged (e.g. events gone but agents remaining) or with no
          // audit record. All-or-nothing. (WI-1352 finding #8.)
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            // Delete in dependency order
            await client.query(`DELETE FROM events WHERE agent_id IN (${placeholders})`, ids);
            await client.query(`DELETE FROM sessions WHERE agent_id IN (${placeholders})`, ids);
            await client.query(`DELETE FROM daily_stats WHERE agent_id IN (${placeholders})`, ids);
            await client.query(`DELETE FROM benchmark_runs WHERE tenant_id = $1`, [body.scope_id]);
            await client.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [body.scope_id]);
            await client.query(`DELETE FROM workflow_runs WHERE tenant_id = $1`, [body.scope_id]);
            await client.query(`DELETE FROM workflows WHERE tenant_id = $1`, [body.scope_id]);
            await client.query(`DELETE FROM agents WHERE tenant_id = $1`, [body.scope_id]);
            // Log the purge itself (inside the txn — the audit row lands iff the purge commits)
            await client.query(
              `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, tenant_id)
               VALUES ('system', 'gdpr_purge', 'tenant', $1, $2, $1)`,
              [body.scope_id, JSON.stringify({ scope: 'tenant', scope_id: body.scope_id, rows_deleted: results })]
            );
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        }
      }
    } else if (body.scope === "agent") {
      // Capture the agent's tenant before any purge: existence check (404) + GDPR
      // audit attribution (the audit row records the purged agent's tenant).
      const agentRow = await query(
        `SELECT tenant_id FROM agents WHERE id = $1`, [body.scope_id]
      );
      if (agentRow.rows.length === 0) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      const agentTenantId = (agentRow.rows[0] as { tenant_id: string | null }).tenant_id ?? "transformate";

      const eventCount = await query(
        `SELECT COUNT(*)::int as c FROM events WHERE agent_id = $1`, [body.scope_id]
      );
      results.events = eventCount.rows[0]?.c ?? 0;

      const sessionCount = await query(
        `SELECT COUNT(*)::int as c FROM sessions WHERE agent_id = $1`, [body.scope_id]
      );
      results.sessions = sessionCount.rows[0]?.c ?? 0;

      const statsCount = await query(
        `SELECT COUNT(*)::int as c FROM daily_stats WHERE agent_id = $1`, [body.scope_id]
      );
      results.daily_stats = statsCount.rows[0]?.c ?? 0;

      const benchCount = await query(
        `SELECT COUNT(*)::int as c FROM benchmark_runs WHERE agent_id = $1`, [body.scope_id]
      );
      results.benchmark_runs = benchCount.rows[0]?.c ?? 0;

      if (!dryRun) {
        // Single transaction — atomic purge + consistent audit (WI-1352 finding #8).
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(`DELETE FROM events WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM sessions WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM daily_stats WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM benchmark_runs WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM agents WHERE id = $1`, [body.scope_id]);
          await client.query(
            `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, tenant_id)
             VALUES ('system', 'gdpr_purge', 'agent', $1, $2, $3)`,
            [body.scope_id, JSON.stringify({ scope: 'agent', scope_id: body.scope_id, tenant_id: agentTenantId, rows_deleted: results }), agentTenantId]
          );
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      }
    }

    return NextResponse.json({
      scope: body.scope,
      scope_id: body.scope_id,
      dry_run: dryRun,
      rows_affected: results,
      purged_at: dryRun ? null : new Date().toISOString(),
      ok: true,
    });
  } catch (err) {
    console.error("[compliance/purge] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
