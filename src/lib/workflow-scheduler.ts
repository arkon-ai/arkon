// src/lib/workflow-scheduler.ts — Cron scheduler for workflow execution
// Phase 5b: Runs active cron-triggered workflows on schedule
// Uses setInterval(60s) tick + lightweight cron expression matching (no external deps)

import { query } from "@/lib/db";
import { runWorkflow, type WorkflowRecord } from "@/lib/workflow-engine";

// ── Cron expression parser ─────────────────────────────────────────────────────
// Supports standard 5-field cron: minute hour day-of-month month day-of-week
// Fields: *, */N, N, N-M, N,M,O

function parseCronField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();

    if (trimmed === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    const stepMatch = trimmed.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[4], 10);
      let start = min;
      let end = max;
      if (stepMatch[2] !== undefined) {
        start = parseInt(stepMatch[2], 10);
        end = parseInt(stepMatch[3], 10);
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return values;
}

interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseCronExpression(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  return {
    minutes: parseCronField(parts[0], 0, 59),
    hours: parseCronField(parts[1], 0, 23),
    daysOfMonth: parseCronField(parts[2], 1, 31),
    months: parseCronField(parts[3], 1, 12),
    daysOfWeek: parseCronField(parts[4], 0, 6), // 0 = Sunday
  };
}

function cronMatchesNow(parsed: ParsedCron, now: Date): boolean {
  return (
    parsed.minutes.has(now.getMinutes()) &&
    parsed.hours.has(now.getHours()) &&
    parsed.daysOfMonth.has(now.getDate()) &&
    parsed.months.has(now.getMonth() + 1) &&
    parsed.daysOfWeek.has(now.getDay())
  );
}

/** Calculate the next time a cron expression will fire (up to 48h ahead) */
export function getNextCronRun(expression: string): Date | null {
  const parsed = parseCronExpression(expression);
  if (!parsed) return null;

  const now = new Date();
  const check = new Date(now);
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1); // Start from next minute

  const limit = 48 * 60; // Check up to 48 hours ahead
  for (let i = 0; i < limit; i++) {
    if (cronMatchesNow(parsed, check)) return check;
    check.setMinutes(check.getMinutes() + 1);
  }

  return null;
}

/** Describe a cron expression in human-readable form */
export function describeCron(expression: string): string {
  const presets: Record<string, string> = {
    "* * * * *": "Every minute",
    "*/5 * * * *": "Every 5 minutes",
    "*/10 * * * *": "Every 10 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *": "Every hour",
    "0 */2 * * *": "Every 2 hours",
    "0 */6 * * *": "Every 6 hours",
    "0 6 * * *": "Daily at 8:00 SAST",
    "0 4 * * *": "Daily at 6:00 SAST",
    "0 8 * * *": "Daily at 10:00 SAST",
    "0 6 * * 1": "Weekly Mon 8:00 SAST",
    "0 6 * * 1-5": "Weekdays 8:00 SAST",
  };
  return presets[expression.trim()] ?? expression;
}

// ── Scheduler state ────────────────────────────────────────────────────────────

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastTick: Date | null = null;
let activeRuns = 0;

const MAX_CONCURRENT_RUNS = 5;

export function getSchedulerStatus(): {
  running: boolean;
  lastTick: string | null;
  activeRuns: number;
} {
  return {
    running: isRunning,
    lastTick: lastTick?.toISOString() ?? null,
    activeRuns,
  };
}

// ── Core tick — runs every 60 seconds ──────────────────────────────────────────

async function schedulerTick(): Promise<void> {
  lastTick = new Date();

  if (activeRuns >= MAX_CONCURRENT_RUNS) {
    console.log(`[workflow-scheduler] Skipping tick — ${activeRuns} runs in progress (max ${MAX_CONCURRENT_RUNS})`);
    return;
  }

  try {
    // Load all active cron workflows
    const result = await query(
      `SELECT id, name, definition, status, trigger_type, trigger_config, tenant_id
       FROM workflows
       WHERE status = 'active' AND trigger_type = 'cron' AND trigger_config IS NOT NULL`
    );

    const workflows = result.rows as WorkflowRecord[];
    if (workflows.length === 0) return;

    const now = new Date();

    for (const wf of workflows) {
      if (activeRuns >= MAX_CONCURRENT_RUNS) break;

      const config = wf.trigger_config;
      if (!config?.cron_expression) continue;

      const parsed = parseCronExpression(config.cron_expression);
      if (!parsed) {
        console.warn(`[workflow-scheduler] Invalid cron expression for workflow ${wf.id} "${wf.name}": ${config.cron_expression}`);
        continue;
      }

      if (!cronMatchesNow(parsed, now)) continue;

      // Fire this workflow
      activeRuns++;
      console.log(`[workflow-scheduler] Executing workflow ${wf.id} "${wf.name}" (cron: ${config.cron_expression})`);

      runWorkflow(wf, "cron")
        .then((result) => {
          console.log(
            `[workflow-scheduler] Workflow ${wf.id} "${wf.name}" ${result.status} (run #${result.runId}, ${result.steps.length} steps)`
          );
        })
        .catch((err) => {
          console.error(`[workflow-scheduler] Workflow ${wf.id} "${wf.name}" execution error:`, err);
        })
        .finally(() => {
          activeRuns--;
        });
    }
  } catch (err) {
    console.error("[workflow-scheduler] Tick error:", err);
  }
}

// ── Start / Stop ───────────────────────────────────────────────────────────────

export function startScheduler(): void {
  if (isRunning) {
    console.log("[workflow-scheduler] Already running");
    return;
  }

  console.log("[workflow-scheduler] Starting cron scheduler (60s tick interval)");
  isRunning = true;

  // Run first tick immediately
  schedulerTick();

  // Then every 60 seconds, aligned to the start of each minute
  const now = new Date();
  const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

  setTimeout(() => {
    schedulerTick();
    schedulerInterval = setInterval(schedulerTick, 60_000);
  }, msUntilNextMinute);
}

export function stopScheduler(): void {
  if (!isRunning) return;

  console.log("[workflow-scheduler] Stopping cron scheduler");
  isRunning = false;

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
