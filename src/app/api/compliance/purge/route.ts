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

      // WI-1848: agent-keyed tables need agent ids, but tenant-keyed tables
      // must purge even when the tenant has no agents — the old ids.length
      // guard silently skipped workflows/audit/incidents for agent-less
      // tenants (panel finding).
      const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(",");

      if (ids.length > 0) {
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

        // WI-1848: tool_calls.agent_id FK has no cascade (prod parity) — must
        // be purged before agents or the delete below FK-faults.
        const toolCallCount = await query(
          `SELECT COUNT(*)::int as c FROM tool_calls WHERE agent_id IN (${placeholders})`, ids
        );
        results.tool_calls = toolCallCount.rows[0]?.c ?? 0;
      } else {
        results.events = 0;
        results.sessions = 0;
        results.daily_stats = 0;
        results.tool_calls = 0;
      }

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

      // WI-1848: incidents exist on every DB now (migration 025) and hold
      // tenant data — a tenant purge must take them (updates cascade via FK).
      const incidentCount = await query(
        `SELECT COUNT(*)::int as c FROM incidents WHERE tenant_id = $1`, [body.scope_id]
      );
      results.incidents = incidentCount.rows[0]?.c ?? 0;
      const incidentUpdateCount = await query(
        `SELECT COUNT(*)::int as c FROM incident_updates iu JOIN incidents i ON i.id = iu.incident_id WHERE i.tenant_id = $1`, [body.scope_id]
      );
      results.incident_updates = incidentUpdateCount.rows[0]?.c ?? 0;

      results.agents = ids.length;

      if (!dryRun) {
        // Single transaction so a mid-chain failure cannot leave a tenant
        // partially purged (e.g. events gone but agents remaining) or with no
        // audit record. All-or-nothing. (WI-1352 finding #8.)
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // WI-1848 (CR #87): lock the tenant's agent rows first — FK checks
          // on tool_calls take KEY SHARE, so FOR UPDATE blocks concurrent
          // inserts referencing these agents until commit (no TOCTOU between
          // the tool_calls delete and the agents delete). Agent-keyed deletes
          // re-resolve the set inside the txn instead of trusting the
          // pre-transaction snapshot.
          // Locking the tenants row gates NEW agent inserts too (agents.tenant_id
          // FK takes KEY SHARE on it) — without this, an agent created after the
          // agents-row lock could gain tool_calls and FK-abort the purge. Side
          // effect: other tenants-FK child inserts for THIS tenant stall for the
          // purge duration — acceptable for a GDPR purge.
          await client.query(`SELECT id FROM tenants WHERE id = $1 FOR UPDATE`, [body.scope_id]);
          await client.query(`SELECT id FROM agents WHERE tenant_id = $1 FOR UPDATE`, [body.scope_id]);
          await client.query(`DELETE FROM events WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = $1)`, [body.scope_id]);
          await client.query(`DELETE FROM sessions WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = $1)`, [body.scope_id]);
          await client.query(`DELETE FROM daily_stats WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = $1)`, [body.scope_id]);
          await client.query(`DELETE FROM tool_calls WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = $1)`, [body.scope_id]);
          await client.query(`DELETE FROM benchmark_runs WHERE tenant_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM audit_log WHERE tenant_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM workflow_runs WHERE tenant_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM workflows WHERE tenant_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM incidents WHERE tenant_id = $1`, [body.scope_id]);
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
    } else if (body.scope === "agent") {
      // Capture the agent's tenant before any purge: existence check (404) + GDPR
      // audit attribution (the audit row records the purged agent's tenant).
      const agentRow = await query(
        `SELECT tenant_id FROM agents WHERE id = $1`, [body.scope_id]
      );
      if (agentRow.rows.length === 0) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }
      const agentTenantId = (agentRow.rows[0] as { tenant_id: string | null }).tenant_id ?? null;
      // Keep the TRUE attribution (incl. orphan flag) in the audit detail; the
      // audit tenant_id column falls back to the platform tenant only to stay
      // FK-safe for an orphaned (NULL-tenant) agent. (CR #67.)
      const auditTenant = agentTenantId ?? "transformate";

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

      // WI-1848: no cascade on tool_calls.agent_id (prod parity) — purge explicitly.
      const toolCallCount = await query(
        `SELECT COUNT(*)::int as c FROM tool_calls WHERE agent_id = $1`, [body.scope_id]
      );
      results.tool_calls = toolCallCount.rows[0]?.c ?? 0;

      if (!dryRun) {
        // Single transaction — atomic purge + consistent audit (WI-1352 finding #8).
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // WI-1848 (CR #87): lock the agent row — blocks concurrent tool_calls
          // FK references until commit (see tenant-scope note above).
          await client.query(`SELECT id FROM agents WHERE id = $1 FOR UPDATE`, [body.scope_id]);
          await client.query(`DELETE FROM events WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM sessions WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM daily_stats WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM benchmark_runs WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM tool_calls WHERE agent_id = $1`, [body.scope_id]);
          await client.query(`DELETE FROM agents WHERE id = $1`, [body.scope_id]);
          await client.query(
            `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, tenant_id)
             VALUES ('system', 'gdpr_purge', 'agent', $1, $2, $3)`,
            [body.scope_id, JSON.stringify({ scope: 'agent', scope_id: body.scope_id, agent_tenant_id: agentTenantId, orphan: agentTenantId === null, rows_deleted: results }), auditTenant]
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
