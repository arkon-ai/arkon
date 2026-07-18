import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized } from "@/app/api/tools/_utils";
import { resolveTenantAccess, dashboardTenantScope } from "@/lib/tenant-access";

/**
 * The keys of `agents.metadata` a non-fleet principal may see. This is an
 * ALLOWLIST: an unrecognized key is dropped, so a field added to metadata later
 * has to be admitted deliberately rather than inherit a tenant-wide audience.
 *
 * It is exactly what the dashboard reads (`dashboard.tsx`,
 * `agent-drawer-detail.tsx`), and it matches the client's own declared contract
 * — `OverviewAgent.metadata` is typed `Record<string, string|number|boolean|null>`,
 * a flat scalar map that cannot represent the nested `connectivity` object at all.
 */
const TENANT_VISIBLE_METADATA = ["model", "provider", "instance", "role"] as const;

/**
 * Project `agents.metadata` for principals WI-1846 newly admitted.
 *
 * This surface was fleet-admin-token-only before the WI, and the row it returns
 * carries `metadata.connectivity.ssh` — {host, user, keyPath}, the
 * emergency-control path to the agent's host, whose user defaults to the fleet
 * operator's own login (`sshUser || "brynn"`, /api/agents/register). An owner may
 * register agents into any tenant, so that block can describe fleet
 * infrastructure. The role floor in dashboardTenantScope decides WHO reaches this
 * surface; this decides WHAT they get (panel R9: opus Major).
 *
 * Allowlist rather than deleting `ssh`: a denylist only closes the keys we
 * thought of, and the audience is now every tenant-bound admin (panel R11: grok
 * Major, opus concurring).
 */
/**
 * Enforce the scalar half of the contract. Allowlisting the KEY is not enough:
 * a writer that puts an object under an allowlisted name — `instance: {ssh:
 * {...}}` — would ship it verbatim, which is the R9 leak one key sideways
 * (panel R12: grok Major). `OverviewAgent.metadata` is declared as a flat scalar
 * map, so anything that is not a scalar is not part of the contract and is
 * dropped rather than forwarded.
 */
function asScalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean"
    ? (value as string | number | boolean)
    : undefined;
}

function projectAgentMetadata(
  metadata: unknown
): Record<string, string | number | boolean | null> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const src = metadata as Record<string, unknown>;
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of TENANT_VISIBLE_METADATA) {
    if (!(key in src)) continue;
    const scalar = asScalar(src[key]);
    if (scalar !== undefined) out[key] = scalar;
  }
  return out;
}

export async function GET(req: NextRequest) {
  // Every aggregate below is scoped to the caller's tenant (WI-1846). The fleet
  // owner keeps the cross-tenant view ("*"); any other credential is pinned to
  // its own tenant_id by resolveTenantAccess, so a forged ?tenant_id or
  // mc_tenant cookie cannot widen the scope (see tenant-access.test.ts).
  const access = await resolveTenantAccess(req, { allowOwnerWildcard: true });
  const tenantId = access && dashboardTenantScope(access);
  if (!access || !tenantId) {
    return unauthorized();
  }

  const scoped = tenantId !== "*";
  const params = scoped ? [tenantId] : [];
  // The fleet admin token was this surface's ONLY caller before WI-1846, so it
  // keeps the payload it always had. Every principal the WI newly admitted —
  // including an unbound owner SESSION, which could not reach this endpoint at
  // all before — gets the projected row. Restoration, not a new restriction.
  const fleetView = access.credential.type === "owner_token";

  try {
    // `events` has no tenant_id — it inherits the agent's via e.agent_id = a.id,
    // so scoping `agents` scopes the event sub-selects (and cost_30d) too.
    // `daily_stats` DOES carry its own tenant_id (NOT NULL since migration 001,
    // backfilled from agents), so todayStats filters it directly to keep the
    // idx_daily_stats_tenant path — but pairs it with an EXISTS on the agent, so
    // a row whose denormalized tenant_id has drifted from agents.tenant_id can't
    // show up for the wrong tenant. Two sources of truth is the bug class this
    // WI is about; the scoped path requires both to agree (panel R3).
    //
    // cost_30d applies the SAME agreement rule (ds.tenant_id = a.tenant_id).
    // Correlating on ds.agent_id alone made this the one aggregate that trusted a
    // single source, so a drifted row still reached the agent's card — the
    // invariant the comment above claims, contradicted two lines below it. The
    // check is uncorrelated to $1, so it holds in the fleet view too, and it can
    // only ever narrow (CodeRabbit Major + panel R13 grok, converging).
    const agents = await query(`
      SELECT a.id, a.name, a.metadata, a.created_at, a.tenant_id,
        (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) as last_active,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '24 hours') as events_24h,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '7 days') as events_7d,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id) as events_total,
        (SELECT COALESCE(SUM(e.token_estimate), 0) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '24 hours') as tokens_24h,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.threat_level IS NOT NULL AND e.threat_level != 'none' AND e.created_at > NOW() - INTERVAL '30 days') as threats_30d,
        (SELECT COALESCE(SUM(ds.estimated_cost_usd), 0) FROM daily_stats ds WHERE ds.agent_id = a.id AND ds.tenant_id = a.tenant_id AND ds.day > CURRENT_DATE - INTERVAL '30 days') as cost_30d
      FROM agents a
      ${scoped ? "WHERE a.tenant_id = $1" : ""}
      ORDER BY last_active DESC NULLS LAST
    `, params);

    const todayStats = await query(`
      SELECT agent_id, tenant_id,
        COALESCE(SUM(messages_received), 0) as received,
        COALESCE(SUM(messages_sent), 0) as sent,
        COALESCE(SUM(tool_calls), 0) as tools,
        COALESCE(SUM(errors), 0) as errors,
        COALESCE(SUM(estimated_tokens), 0) as tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as cost
      FROM daily_stats
      WHERE day = CURRENT_DATE
      ${scoped ? "AND tenant_id = $1 AND EXISTS (SELECT 1 FROM agents a WHERE a.id = daily_stats.agent_id AND a.tenant_id = $1)" : ""}
      GROUP BY agent_id, tenant_id
    `, params);

    const tenants = await query(`
      SELECT id, name, domain, plan, created_at FROM tenants
      ${scoped ? "WHERE id = $1" : ""}
      ORDER BY name
    `, params);

    // Per-principal since WI-1846 — this body used to be identical for the only
    // caller that could reach it.
    return NextResponse.json(
      {
        agents: fleetView
          ? agents.rows
          : agents.rows.map((a) => ({ ...a, metadata: projectAgentMetadata(a.metadata) })),
        todayStats: todayStats.rows,
        tenants: tenants.rows,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[dashboard/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
