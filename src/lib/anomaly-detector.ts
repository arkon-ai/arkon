/**
 * BaselineWatch — Arkon Anomaly Detector
 * Computes 7-day rolling baselines and detects rate anomalies per agent.
 */

import { query } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";

interface BaselineRow {
  agent_id: string;
  avg_hourly_events: number;
}

interface RecentRate {
  agent_id: string;
  agent_name: string;
  events_last_5min: number;
}

const SPIKE_HIGH_MULTIPLIER = 3;
const SPIKE_MEDIUM_MULTIPLIER = 2;
const SILENCE_THRESHOLD = 0.1; // less than 10% of normal = silence alert

/**
 * Recompute 7-day baselines for all agents.
 * Run nightly.
 */
export async function recomputeBaselines(): Promise<void> {
  const baselines = await query(`
    SELECT
      agent_id,
      COUNT(*)::NUMERIC / (7 * 24) AS avg_hourly_events,
      COALESCE(SUM(token_estimate), 0)::NUMERIC / (7 * 24) AS avg_hourly_tokens
    FROM events
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY agent_id
  `);

  for (const row of baselines.rows as BaselineRow[]) {
    await query(
      `INSERT INTO agent_baselines (agent_id, computed_at, avg_hourly_events, period_days)
       VALUES ($1, NOW(), $2, 7)`,
      [row.agent_id, row.avg_hourly_events]
    );
  }
}

/**
 * Check current 5-minute rates against latest baseline.
 * Call every 5 minutes.
 */
export async function checkAnomalies(): Promise<void> {
  // Get current 5-min event rate for agents active in last 30 min
  const recentRates = await query(`
    SELECT
      e.agent_id,
      a.name AS agent_name,
      COUNT(*) AS events_last_5min
    FROM events e
    JOIN agents a ON a.id = e.agent_id
    WHERE e.created_at > NOW() - INTERVAL '5 minutes'
    GROUP BY e.agent_id, a.name
  `);

  // Get latest baselines
  const baselines = await query(`
    SELECT DISTINCT ON (agent_id)
      agent_id, avg_hourly_events
    FROM agent_baselines
    ORDER BY agent_id, computed_at DESC
  `);

  const baselineMap = new Map<string, number>(
    (baselines.rows as BaselineRow[]).map((b) => [b.agent_id, Number(b.avg_hourly_events)])
  );

  for (const row of recentRates.rows as RecentRate[]) {
    const baseline = baselineMap.get(row.agent_id);
    if (!baseline || baseline < 1) continue; // no baseline yet — skip

    // Annualise 5-min count to per-hour rate
    const currentRate = Number(row.events_last_5min) * 12;
    const multiplier = currentRate / baseline;

    let level: "medium" | "high" | null = null;
    let anomalyType = "";

    if (multiplier >= SPIKE_HIGH_MULTIPLIER) {
      level = "high";
      anomalyType = "rate_spike";
    } else if (multiplier >= SPIKE_MEDIUM_MULTIPLIER) {
      level = "medium";
      anomalyType = "rate_spike";
    }

    if (level) {
      // Check if we already alerted in last 30 min for this agent (avoid spam)
      const recent = await query(
        `SELECT id FROM anomaly_alerts
         WHERE agent_id = $1 AND anomaly_type = $2 AND created_at > NOW() - INTERVAL '30 minutes'
         LIMIT 1`,
        [row.agent_id, anomalyType]
      );
      if (recent.rows.length > 0) continue;

      // Write alert
      await query(
        `INSERT INTO anomaly_alerts (agent_id, anomaly_type, level, current_rate, baseline_rate, multiplier)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.agent_id, anomalyType, level, currentRate, baseline, multiplier]
      );

      // Fire notification for HIGH anomalies
      if (level === "high") {
        void sendNotification({
          tenantId: "default",
          type: "anomaly",
          severity: "warning",
          title: `Rate spike detected — ${row.agent_name}`,
          body: `${multiplier.toFixed(1)}x baseline. Current: ${Math.round(currentRate)} events/hr vs baseline ${Math.round(baseline)} events/hr`,
          link: `/analytics`,
          metadata: { agentId: row.agent_id, anomalyType, multiplier },
        });
      }
    }
  }

  // Check for agents that went silent (had baseline activity, now zero)
  const agentsWithBaseline = [...baselineMap.entries()].filter(([, b]) => b > 2);
  for (const [agentId, baseline] of agentsWithBaseline) {
    const hasRecent = recentRates.rows.some((r: RecentRate) => r.agent_id === agentId);
    if (!hasRecent) {
      const currentRate = 0;
      const multiplier = currentRate / baseline;

      if (multiplier <= SILENCE_THRESHOLD) {
        // Only alert if agent was recently active (last hour)
        const wasActive = await query(
          `SELECT 1 FROM events WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '1 hour' LIMIT 1`,
          [agentId]
        );
        if (wasActive.rows.length === 0) continue;

        const recentSilence = await query(
          `SELECT id FROM anomaly_alerts
           WHERE agent_id = $1 AND anomaly_type = 'rate_silence' AND created_at > NOW() - INTERVAL '2 hours'
           LIMIT 1`,
          [agentId]
        );
        if (recentSilence.rows.length > 0) continue;

        await query(
          `INSERT INTO anomaly_alerts (agent_id, anomaly_type, level, current_rate, baseline_rate, multiplier)
           VALUES ($1, 'rate_silence', 'medium', 0, $2, 0)`,
          [agentId, baseline]
        );

        // Get agent name for notification
        const agentRow = await query("SELECT name FROM agents WHERE id = $1 LIMIT 1", [agentId]);
        const agentName = (agentRow.rows[0] as { name: string } | undefined)?.name ?? agentId;

        void sendNotification({
          tenantId: "default",
          type: "agent_offline",
          severity: "warning",
          title: `Agent went silent: ${agentName}`,
          body: `No events in the last 5 minutes. Baseline: ${Math.round(baseline)} events/hr`,
          link: `/agents/${agentId}`,
          metadata: { agentId, baseline: Math.round(baseline) },
        });
      }
    }
  }
}
