import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

const FLEET_SLUGS = ["warden", "codesmith", "lumina", "sentinel"] as const;
type FleetSlug = (typeof FLEET_SLUGS)[number];
const FLEET_SLUGS_PARAM: string[] = [...FLEET_SLUGS];

// Author attribution on warden_messages was only correct for delegate replies
// from 2026-04-22 21:41 UTC (Phase 5 bridge fix). Older rows all show
// author_agent='warden' regardless of the true author — surfaced in the UI
// footer, not filtered out of the data.
const ATTRIBUTION_CUTOFF_ISO = "2026-04-22T21:41:00Z";

interface IdentityRow {
  slug: FleetSlug;
  display_name: string;
  emoji: string | null;
  model: string | null;
  home_server: string | null;
  description: string | null;
  harness: string | null;
  role: string;
}

interface WaelCountsRow {
  worker_id: FleetSlug;
  started_24h: string;
  completed_24h: string;
  events_24h: string;
}

interface WaelFreshnessRow {
  worker_id: FleetSlug;
  last_heartbeat: string | null;
  last_activity: string | null;
}

interface WaelRecentRow {
  worker_id: FleetSlug;
  event_type: string;
  ts: string;
  payload: Record<string, unknown>;
  status: string | null;
  duration_ms: number | null;
}

interface DelegationRow {
  target: FleetSlug;
  status: string;
  count: number;
}

interface MessageRow {
  author_agent: FleetSlug;
  id: string;
  preview: string;
  created_at: string;
}

interface WorkEntryRow {
  owner_agent: FleetSlug;
  id: string;
  title: string;
  status: string;
  priority: number;
  category: string;
  occurred_at: string;
  related_project: string | null;
}

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  try {
    const [idRes, countsRes, freshnessRes, recentRes, delRes, msgRes, workRes] = await Promise.all([
      query(
        `SELECT slug, display_name, emoji, model, home_server, description, harness, role
           FROM agent_identities
          WHERE active = TRUE
            AND slug = ANY($1::text[])
          ORDER BY CASE slug
                     WHEN 'warden' THEN 0
                     WHEN 'codesmith' THEN 1
                     WHEN 'lumina' THEN 2
                     WHEN 'sentinel' THEN 3
                   END`,
        [FLEET_SLUGS_PARAM]
      ),

      // 24h counts (events started/completed in the last day).
      query(
        `SELECT worker_id,
                COUNT(*) FILTER (WHERE event_type = 'task_started')   AS started_24h,
                COUNT(*) FILTER (WHERE event_type = 'task_completed') AS completed_24h,
                COUNT(*)                                              AS events_24h
           FROM worker_activity_events
          WHERE ts > NOW() - INTERVAL '24 hours'
            AND worker_id = ANY($1::text[])
          GROUP BY worker_id`,
        [FLEET_SLUGS_PARAM]
      ),

      // Freshness — UNSCOPED across all WAEL history. Without this, any
      // agent idle >24h would null out and render Offline, even if the
      // correct health signal is just "last seen N hours ago". Index
      // wael_worker_ts_idx (worker_id, ts DESC) makes MAX(ts) O(log n).
      // last_activity = MAX(ts) across all event types; Warden/Codesmith
      // use this as their health signal since they don't emit heartbeats.
      query(
        `SELECT worker_id,
                MAX(ts) FILTER (WHERE event_type = 'heartbeat') AS last_heartbeat,
                MAX(ts)                                          AS last_activity
           FROM worker_activity_events
          WHERE worker_id = ANY($1::text[])
          GROUP BY worker_id`,
        [FLEET_SLUGS_PARAM]
      ),

      query(
        `SELECT worker_id, event_type, ts, payload, status, duration_ms
           FROM (
             SELECT worker_id, event_type, ts, payload, status, duration_ms,
                    ROW_NUMBER() OVER (PARTITION BY worker_id ORDER BY ts DESC) AS rn
               FROM worker_activity_events
              WHERE ts > NOW() - INTERVAL '24 hours'
                AND worker_id = ANY($1::text[])
           ) t
          WHERE rn <= 5
          ORDER BY worker_id, ts DESC`,
        [FLEET_SLUGS_PARAM]
      ),

      // Phase 6 rule: target='warden' self-delegation refusals are excluded
      // from fleet UI. Warden is delegator, not a delegation target.
      query(
        `SELECT target, status, COUNT(*)::int AS count
           FROM delegation_jobs
          WHERE queued_at > NOW() - INTERVAL '7 days'
            AND target = ANY($1::text[])
            AND target != 'warden'
          GROUP BY target, status
          ORDER BY target, status`,
        [FLEET_SLUGS_PARAM]
      ),

      query(
        `SELECT author_agent, id::text, preview, created_at
           FROM (
             SELECT author_agent, id, created_at,
                    substring(content FROM 1 FOR 160) AS preview,
                    ROW_NUMBER() OVER (PARTITION BY author_agent ORDER BY created_at DESC) AS rn
               FROM warden_messages
              WHERE author_agent = ANY($1::text[])
                AND role = 'assistant'
                AND created_at > NOW() - INTERVAL '7 days'
           ) t
          WHERE rn <= 3
          ORDER BY author_agent, created_at DESC`,
        [FLEET_SLUGS_PARAM]
      ),

      query(
        `SELECT owner_agent, id::text, title, status, priority, category, occurred_at, related_project
           FROM (
             SELECT owner_agent, id, title, status, priority, category, occurred_at, related_project,
                    ROW_NUMBER() OVER (
                      PARTITION BY owner_agent
                      ORDER BY priority ASC, occurred_at DESC
                    ) AS rn
               FROM work_entries
              WHERE status IN ('todo', 'in_progress', 'blocked')
                AND owner_agent = ANY($1::text[])
           ) t
          WHERE rn <= 5
          ORDER BY owner_agent, priority ASC, occurred_at DESC`,
        [FLEET_SLUGS_PARAM]
      ),
    ]);

    const identities = idRes.rows as IdentityRow[];
    const waelCounts = countsRes.rows as WaelCountsRow[];
    const waelFreshness = freshnessRes.rows as WaelFreshnessRow[];
    const waelRecent = recentRes.rows as WaelRecentRow[];
    const delegations = delRes.rows as DelegationRow[];
    const messageRows = msgRes.rows as MessageRow[];
    const workRows = workRes.rows as WorkEntryRow[];

    const agents = identities.map((identity) => {
      const slug = identity.slug;
      const counts = waelCounts.find((r) => r.worker_id === slug);
      const freshness = waelFreshness.find((r) => r.worker_id === slug);
      const recentEvents = waelRecent.filter((r) => r.worker_id === slug);
      const delegationRows = delegations.filter((r) => r.target === slug);
      const agentMessages = messageRows.filter((r) => r.author_agent === slug);
      const agentWork = workRows.filter((r) => r.owner_agent === slug);

      return {
        identity,
        activity: {
          last_heartbeat: freshness?.last_heartbeat ?? null,
          last_activity: freshness?.last_activity ?? null,
          started_24h: Number(counts?.started_24h ?? 0),
          completed_24h: Number(counts?.completed_24h ?? 0),
          events_24h: Number(counts?.events_24h ?? 0),
          recent_events: recentEvents.map((e) => ({
            event_type: e.event_type,
            ts: e.ts,
            payload: e.payload,
            status: e.status,
            duration_ms: e.duration_ms,
          })),
        },
        delegations: {
          seven_day: delegationRows.map((r) => ({
            status: r.status,
            count: Number(r.count),
          })),
        },
        messages: agentMessages.map((m) => ({
          id: m.id,
          preview: m.preview,
          created_at: m.created_at,
        })),
        work_entries: agentWork.map((w) => ({
          id: w.id,
          title: w.title,
          status: w.status,
          priority: w.priority,
          category: w.category,
          occurred_at: w.occurred_at,
          related_project: w.related_project,
        })),
      };
    });

    return NextResponse.json({
      agents,
      attribution_cutoff: ATTRIBUTION_CUTOFF_ISO,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[fleet/agents] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
