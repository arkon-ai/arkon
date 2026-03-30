import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin, forbidden, validateRole } from "@/app/api/tools/_utils";

interface CronJob {
  id: string;
  name?: string;
  enabled?: boolean;
  schedule?: {
    kind: string;
    expr?: string;
    tz?: string;
    everyMs?: number;
    at?: string;
  };
  sessionTarget?: string;
  payload?: {
    kind: string;
    message?: string;
    model?: string;
  };
  delivery?: { mode?: string };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: string;
    lastError?: string;
    consecutiveErrors?: number;
  };
}

/** Send an instruction to the OpenClaw gateway via /hooks/agent.
 *  Falls back to storing a note event in the MC database. */
async function sendToGateway(text: string, meta: Record<string, unknown>): Promise<{ sent: boolean; method: string }> {
  const gatewayUrl = process.env.GATEWAY_URL ?? "";
  const hookToken = process.env.GATEWAY_HOOK_TOKEN ?? process.env.GATEWAY_TOKEN ?? "";
  const hooksBase = process.env.GATEWAY_HOOKS_URL ?? (gatewayUrl ? `${gatewayUrl}/hooks` : "");

  // Attempt 1: /hooks/agent — isolated agent turn, bypasses heartbeat model
  if (!hooksBase) {
    // No gateway configured — fall through to DB fallback
  } else try {
    const res = await fetch(`${hooksBase}/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hookToken}`,
      },
      body: JSON.stringify({
        message: text,
        name: "MC-Cron",
        deliver: false,
        model: "openai-codex/gpt-5.1",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      return { sent: true, method: "hooks-agent" };
    }
    const errBody = await res.text().catch(() => "");
    console.error(`[crons] /hooks/agent failed: ${res.status} ${errBody}`);
  } catch (e) {
    console.error(`[crons] /hooks/agent error:`, e);
  }

  // Attempt 2: store as note event in MC DB (Activity Feed fallback)
  try {
    await query(
      `INSERT INTO events (agent_id, session_key, event_type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        "system",
        "cron-manager",
        "note",
        text,
        JSON.stringify(meta),
      ]
    );
    console.error(`[crons] gateway unreachable, stored as activity-feed note`);
    return { sent: true, method: "activity-feed" };
  } catch (dbErr) {
    console.error(`[crons] DB fallback also failed:`, dbErr);
    return { sent: false, method: "none" };
  }
}

// GET /api/admin/crons — list all synced cron jobs
export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const result = await query(`
    SELECT id, name, enabled, schedule_kind, schedule_expr, schedule_tz,
           session_target, payload_kind, payload_message, payload_model,
           delivery_mode, next_run_at, last_run_at, last_status,
           last_error, consecutive_errors, synced_at, raw
    FROM cron_jobs
    ORDER BY name ASC
  `);

  return NextResponse.json({ jobs: result.rows, count: result.rowCount });
}

// POST /api/admin/crons — sync jobs from gateway (called by sync script)
// Also used to send a message to the agent about a specific cron job
export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const body = await req.json() as { jobs?: CronJob[]; action?: string; jobId?: string; message?: string };

  // Action: send message to gateway about a specific cron job
  if (body.action === "message") {
    const { jobId, message } = body;
    if (!jobId || !message) {
      return NextResponse.json({ error: "jobId and message required" }, { status: 400 });
    }

    // Get job details for context
    const jobRow = await query("SELECT name, schedule_expr, enabled, raw FROM cron_jobs WHERE id = $1", [jobId]);
    const job = jobRow.rows[0];
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const contextualMessage = `[Cron Job: ${job.name ?? jobId}] Schedule: ${job.schedule_expr ?? "custom"} | Status: ${job.enabled ? "enabled" : "disabled"}\n\nUser message: ${message}`;
    const fullText = `[MC Cron Manager]\n${contextualMessage}`;

    const { sent, method } = await sendToGateway(fullText, {
      source: "cron-manager",
      jobId,
      jobName: job.name,
    });

    if (!sent) {
      return NextResponse.json({ error: "Failed to deliver message to gateway" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: true, method });
  }

  // Default: sync jobs array
  const { jobs } = body;
  if (!Array.isArray(jobs)) {
    return NextResponse.json({ error: "jobs array required" }, { status: 400 });
  }

  let synced = 0;
  for (const job of jobs) {
    const schedule = (job.schedule ?? {}) as Record<string, unknown>;
    const state = (job.state ?? {}) as Record<string, unknown>;
    const payload = (job.payload ?? {}) as Record<string, unknown>;

    await query(`
      INSERT INTO cron_jobs (
        id, name, enabled, schedule_kind, schedule_expr, schedule_tz,
        session_target, payload_kind, payload_message, payload_model,
        delivery_mode, next_run_at, last_run_at, last_status,
        last_error, consecutive_errors, raw, synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        enabled = EXCLUDED.enabled,
        schedule_kind = EXCLUDED.schedule_kind,
        schedule_expr = EXCLUDED.schedule_expr,
        schedule_tz = EXCLUDED.schedule_tz,
        session_target = EXCLUDED.session_target,
        payload_kind = EXCLUDED.payload_kind,
        payload_message = EXCLUDED.payload_message,
        payload_model = EXCLUDED.payload_model,
        delivery_mode = EXCLUDED.delivery_mode,
        next_run_at = EXCLUDED.next_run_at,
        last_run_at = EXCLUDED.last_run_at,
        last_status = EXCLUDED.last_status,
        last_error = EXCLUDED.last_error,
        consecutive_errors = EXCLUDED.consecutive_errors,
        raw = EXCLUDED.raw,
        synced_at = NOW()
    `, [
      job.id,
      job.name ?? null,
      job.enabled ?? true,
      (schedule.kind as string) ?? null,
      (schedule.expr as string) ?? (schedule.everyMs ? `every ${schedule.everyMs}ms` : (schedule.at as string) ?? null),
      (schedule.tz as string) ?? null,
      job.sessionTarget ?? null,
      (payload.kind as string) ?? null,
      payload.message ? (payload.message as string).slice(0, 500) : null,
      (payload.model as string) ?? null,
      job.delivery?.mode ?? null,
      state.nextRunAtMs ? new Date(state.nextRunAtMs as number) : null,
      state.lastRunAtMs ? new Date(state.lastRunAtMs as number) : null,
      (state.lastStatus as string) ?? null,
      (state.lastError as string) ?? null,
      (state.consecutiveErrors as number) ?? 0,
      JSON.stringify(job),
    ]);
    synced++;
  }

  return NextResponse.json({ ok: true, synced });
}

// PATCH /api/admin/crons — owner only: enable/disable via gateway
export async function PATCH(req: NextRequest) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const body = await req.json() as { jobId?: string; action?: string };
  const { jobId, action } = body;
  if (!jobId || !action) return NextResponse.json({ error: "jobId and action required" }, { status: 400 });

  // Get job name for context
  const jobRow = await query("SELECT name, schedule_expr FROM cron_jobs WHERE id = $1", [jobId]);
  const jobName = jobRow.rows[0]?.name ?? jobId;

  const actionText = action === "disable"
    ? `Disable cron job with ID ${jobId} (name: ${jobName}). Use the cron tool: action=update, jobId=${jobId}, patch={enabled:false}.`
    : action === "enable"
    ? `Enable cron job with ID ${jobId} (name: ${jobName}). Use the cron tool: action=update, jobId=${jobId}, patch={enabled:true}.`
    : action === "delete"
    ? `Delete cron job with ID ${jobId} (name: ${jobName}). Use the cron tool: action=remove, jobId=${jobId}. Confirm deletion after.`
    : `Run cron job with ID ${jobId} (name: ${jobName}) immediately. Use the cron tool: action=run, jobId=${jobId}.`;

  const fullText = `[MC Admin Panel — Cron Action]\n${actionText}`;

  const { sent, method } = await sendToGateway(fullText, {
    source: "cron-action",
    action,
    jobId,
    jobName,
  });

  return NextResponse.json({ ok: true, action, jobId, method: sent ? method : "failed" });
}
