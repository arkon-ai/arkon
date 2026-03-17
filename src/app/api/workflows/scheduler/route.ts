// src/app/api/workflows/scheduler/route.ts — Scheduler status API
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { getSchedulerStatus, getNextCronRun, describeCron } from "@/lib/workflow-scheduler";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const scheduler = getSchedulerStatus();

    // Get all cron workflows with schedule info
    const cronWorkflows = await query(
      `SELECT id, name, status, trigger_config, last_run_at, run_count,
              (SELECT COUNT(*)::int FROM workflow_runs wr
               WHERE wr.workflow_id = w.id AND wr.status = 'failed'
               AND wr.started_at > NOW() - INTERVAL '24 hours') as recent_failures
       FROM workflows w
       WHERE trigger_type = 'cron' AND status = 'active'
       ORDER BY name`
    );

    const schedules = cronWorkflows.rows.map((wf: Record<string, unknown>) => {
      const config = wf.trigger_config as { cron_expression?: string } | null;
      const expr = config?.cron_expression ?? "";
      return {
        id: wf.id,
        name: wf.name,
        cron_expression: expr,
        description: describeCron(expr),
        next_run: expr ? getNextCronRun(expr)?.toISOString() ?? null : null,
        last_run_at: wf.last_run_at,
        run_count: wf.run_count,
        recent_failures: wf.recent_failures,
      };
    });

    // Webhook workflows
    const webhookWorkflows = await query(
      `SELECT id, name, status, webhook_token, last_run_at, run_count
       FROM workflows
       WHERE trigger_type = 'webhook' AND status = 'active'
       ORDER BY name`
    );

    // Recent runs across all scheduled/webhook workflows
    const recentRuns = await query(
      `SELECT wr.id, wr.workflow_id, w.name as workflow_name,
              wr.status, wr.triggered_by, wr.started_at, wr.completed_at, wr.error
       FROM workflow_runs wr
       JOIN workflows w ON w.id = wr.workflow_id
       WHERE wr.triggered_by IN ('cron', 'webhook')
       ORDER BY wr.started_at DESC
       LIMIT 20`
    );

    return NextResponse.json({
      scheduler,
      schedules,
      webhooks: webhookWorkflows.rows.map((wf: Record<string, unknown>) => ({
        id: wf.id,
        name: wf.name,
        has_token: !!wf.webhook_token,
        last_run_at: wf.last_run_at,
        run_count: wf.run_count,
      })),
      recentRuns: recentRuns.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[workflows/scheduler] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
