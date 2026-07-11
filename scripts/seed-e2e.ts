/**
 * scripts/seed-e2e.ts — Deterministic fixture data for the Playwright E2E suite.
 *
 * TEST / CI ONLY. This script inserts realistic baseline rows into an
 * otherwise-empty (from-scratch) Arkon database so that E2E specs which
 * assume a populated dev DB (pre-seeded MCP servers, recent event activity,
 * a workflow, tasks, notifications, traces, ...) have something to find.
 *
 * SAFETY — this must never be able to touch a real/prod database:
 *   1. Refuses to run unless ARKON_SEED_E2E=1 is explicitly set.
 *   2. Refuses to run if NODE_ENV=production, regardless of the flag above.
 *   3. INSERT-only. Never UPDATEs or DELETEs/TRUNCATEs a pre-existing row.
 *      Every insert is idempotent (ON CONFLICT DO NOTHING, or an explicit
 *      WHERE NOT EXISTS / existence guard for tables without a natural
 *      unique key) — safe to run repeatedly against the same database.
 *   4. Deterministic: fixed ids/names/values, no Math.random()/Date.now()
 *      baked into stored ids. Timestamps use `NOW() - INTERVAL '...'` so
 *      "last 24h" / "today" windows (used by dashboard stat cards) are
 *      populated relative to whenever the script actually runs — that's
 *      required for the fixture to be useful, not a source of randomness.
 *
 * Run: ARKON_SEED_E2E=1 npx tsx scripts/seed-e2e.ts
 * (DATABASE_URL must point at the target Postgres instance, same as migrate.ts)
 */
import { Pool } from "pg";

const SEED_MARKER = "arkon-e2e-seed";

if (process.env.NODE_ENV === "production") {
  console.error("[seed-e2e] Refusing to run: NODE_ENV=production. This script is test/CI fixture data only.");
  process.exit(1);
}

if (process.env.ARKON_SEED_E2E !== "1") {
  console.error("[seed-e2e] Refusing to run: set ARKON_SEED_E2E=1 to opt in explicitly (test/CI only).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
});

async function tableExists(name: string): Promise<boolean> {
  const res = await pool.query("SELECT to_regclass($1) as reg", [`public.${name}`]);
  return res.rows[0]?.reg !== null;
}

async function seedTenants() {
  // Most routes (workflows, incidents, mcp) fall back to tenant_id
  // 'transformate' when no tenant is specified — only 'default' is created
  // by migrations/001_create_tenants.sql, so that fallback tenant doesn't
  // otherwise exist on a from-scratch DB.
  await pool.query(
    `INSERT INTO tenants (id, name, plan) VALUES ('transformate', 'Transformate', 'owner')
     ON CONFLICT (id) DO NOTHING`
  );
  console.log("[seed-e2e] tenants: ensured 'transformate'");
}

async function seedAgents() {
  await pool.query(
    `INSERT INTO agents (id, name, description, framework, role, tenant_id)
     VALUES
       ('lumina', 'Lumina', 'Primary ministry assistant agent (E2E fixture)', 'openclaw', 'operator', 'default'),
       ('content-factory', 'Content Factory', 'Content automation pipeline agent (E2E fixture)', 'openclaw', 'operator', 'default')
     ON CONFLICT (id) DO NOTHING`
  );
  console.log("[seed-e2e] agents: ensured 'lumina', 'content-factory'");
}

async function seedEvents() {
  const already = await pool.query(
    `SELECT 1 FROM events WHERE metadata->>'seed_marker' = $1 LIMIT 1`,
    [SEED_MARKER]
  );
  if ((already.rowCount ?? 0) > 0) {
    console.log("[seed-e2e] events: already seeded, skipping");
    return;
  }

  const meta = JSON.stringify({ seed_marker: SEED_MARKER });
  type EventRow = {
    agentId: string;
    eventType: string;
    direction: string | null;
    sessionKey: string;
    channelId: string;
    sender: string;
    tokenEstimate: number;
    inputTokens: number;
    outputTokens: number;
    age: string; // interval literal, e.g. "10 minutes"
  };
  // Spread across the last 24h (for events_24h / tokens_24h stat cards),
  // the last 7d (events_7d), and older (events_total / daily trend rows).
  const rows: EventRow[] = [
    { agentId: "lumina", eventType: "message_received", direction: "inbound", sessionKey: "e2e-session-1", channelId: "telegram", sender: "brynn", tokenEstimate: 120, inputTokens: 90, outputTokens: 0, age: "10 minutes" },
    { agentId: "lumina", eventType: "message_sent", direction: "outbound", sessionKey: "e2e-session-1", channelId: "telegram", sender: "lumina", tokenEstimate: 340, inputTokens: 0, outputTokens: 340, age: "9 minutes" },
    { agentId: "lumina", eventType: "tool_call", direction: null, sessionKey: "e2e-session-1", channelId: "telegram", sender: "lumina", tokenEstimate: 60, inputTokens: 0, outputTokens: 60, age: "8 minutes" },
    { agentId: "lumina", eventType: "message_received", direction: "inbound", sessionKey: "e2e-session-1", channelId: "discord", sender: "brynn", tokenEstimate: 95, inputTokens: 70, outputTokens: 0, age: "3 hours" },
    { agentId: "lumina", eventType: "message_sent", direction: "outbound", sessionKey: "e2e-session-1", channelId: "discord", sender: "lumina", tokenEstimate: 410, inputTokens: 0, outputTokens: 410, age: "3 hours" },
    { agentId: "lumina", eventType: "error", direction: null, sessionKey: "e2e-session-1", channelId: "discord", sender: "lumina", tokenEstimate: 0, inputTokens: 0, outputTokens: 0, age: "5 hours" },
    { agentId: "content-factory", eventType: "tool_call", direction: null, sessionKey: "e2e-session-2", channelId: "cron", sender: "content-factory", tokenEstimate: 220, inputTokens: 0, outputTokens: 220, age: "12 hours" },
    { agentId: "content-factory", eventType: "message_sent", direction: "outbound", sessionKey: "e2e-session-2", channelId: "cron", sender: "content-factory", tokenEstimate: 180, inputTokens: 0, outputTokens: 180, age: "20 hours" },
    // Older activity so events_7d / events_total / trend charts aren't flat-zero.
    { agentId: "lumina", eventType: "message_received", direction: "inbound", sessionKey: "e2e-session-1", channelId: "telegram", sender: "brynn", tokenEstimate: 100, inputTokens: 80, outputTokens: 0, age: "2 days" },
    { agentId: "lumina", eventType: "message_sent", direction: "outbound", sessionKey: "e2e-session-1", channelId: "telegram", sender: "lumina", tokenEstimate: 260, inputTokens: 0, outputTokens: 260, age: "2 days" },
    { agentId: "lumina", eventType: "tool_call", direction: null, sessionKey: "e2e-session-1", channelId: "telegram", sender: "lumina", tokenEstimate: 50, inputTokens: 0, outputTokens: 50, age: "4 days" },
    { agentId: "content-factory", eventType: "message_sent", direction: "outbound", sessionKey: "e2e-session-2", channelId: "cron", sender: "content-factory", tokenEstimate: 300, inputTokens: 0, outputTokens: 300, age: "6 days" },
  ];

  for (const r of rows) {
    await pool.query(
      `INSERT INTO events (
         agent_id, event_type, direction, session_key, channel_id, sender,
         content, metadata, token_estimate, input_tokens, output_tokens,
         threat_level, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, 'none', NOW() - $12::interval)`,
      [
        r.agentId, r.eventType, r.direction, r.sessionKey, r.channelId, r.sender,
        `E2E fixture ${r.eventType} event`, meta, r.tokenEstimate, r.inputTokens, r.outputTokens, r.age,
      ]
    );
  }
  console.log(`[seed-e2e] events: inserted ${rows.length} fixture events`);
}

async function seedSessions() {
  await pool.query(
    `INSERT INTO sessions (agent_id, session_key, channel_id, last_active, message_count, tenant_id)
     VALUES
       ('lumina', 'e2e-session-1', 'telegram', NOW() - INTERVAL '9 minutes', 6, 'default'),
       ('content-factory', 'e2e-session-2', 'cron', NOW() - INTERVAL '12 hours', 3, 'default')
     ON CONFLICT (agent_id, session_key) DO NOTHING`
  );
  console.log("[seed-e2e] sessions: ensured 2 fixture sessions");
}

async function seedDailyStats() {
  // Last 7 days per agent so sparkline/trend charts have real shape instead
  // of a flat zero line, plus a CURRENT_DATE row for the "today" widgets.
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const received = 4 + daysAgo;
    const sent = 4 + daysAgo;
    const toolCalls = 2 + (daysAgo % 3);
    const errors = daysAgo === 5 ? 1 : 0;
    const tokens = 800 + daysAgo * 50;
    const cost = Number((tokens * 0.000002).toFixed(6));
    await pool.query(
      `INSERT INTO daily_stats (agent_id, day, messages_received, messages_sent, tool_calls, errors, estimated_tokens, estimated_cost_usd, tenant_id)
       VALUES ('lumina', CURRENT_DATE - $1::int, $2, $3, $4, $5, $6, $7, 'default')
       ON CONFLICT (agent_id, day) DO NOTHING`,
      [daysAgo, received, sent, toolCalls, errors, tokens, cost]
    );
  }
  await pool.query(
    `INSERT INTO daily_stats (agent_id, day, messages_received, messages_sent, tool_calls, errors, estimated_tokens, estimated_cost_usd, tenant_id)
     VALUES ('content-factory', CURRENT_DATE, 2, 2, 1, 0, 400, 0.0008, 'default')
     ON CONFLICT (agent_id, day) DO NOTHING`
  );
  console.log("[seed-e2e] daily_stats: ensured 7-day trend for 'lumina' + today for 'content-factory'");
}

async function seedTraces() {
  // Fixed UUIDs so the seed is idempotent without relying on randomness.
  const traces: Array<[string, string, string, string, number, number, number, string]> = [
    ["11111111-1111-4111-8111-111111111101", "lumina", "Ingest → threat scan → respond", "ok", 420, 340, 0.00068, "10 minutes"],
    ["11111111-1111-4111-8111-111111111102", "lumina", "Tool call: calendar.create", "ok", 180, 60, 0.00012, "8 minutes"],
    ["11111111-1111-4111-8111-111111111103", "lumina", "Ingest → responder timeout", "error", 5200, 0, 0, "5 hours"],
    ["11111111-1111-4111-8111-111111111104", "content-factory", "Cron: daily content pull", "ok", 3100, 220, 0.00044, "12 hours"],
  ];

  for (const [traceId, agentId, name, status, durationMs, tokenCount, cost, age] of traces) {
    const existing = await pool.query(`SELECT 1 FROM traces WHERE trace_id = $1 LIMIT 1`, [traceId]);
    if ((existing.rowCount ?? 0) > 0) continue;

    const durationMsText = `${durationMs} milliseconds`;

    await pool.query(
      `INSERT INTO traces (trace_id, agent_id, tenant_id, name, status, duration_ms, token_count, cost, started_at, ended_at)
       VALUES ($1, $2, 'transformate', $3, $4, $5, $6, $7, NOW() - $8::interval, NOW() - $8::interval + $9::interval)`,
      [traceId, agentId, name, status, durationMs, tokenCount, cost, age, durationMsText]
    );

    await pool.query(
      `INSERT INTO spans (trace_id, name, type, status, duration_ms, token_count, cost, started_at, ended_at)
       VALUES ($1, $2, 'chain', $3, $4, $5, $6, NOW() - $7::interval, NOW() - $7::interval + $8::interval)`,
      [traceId, name, status, durationMs, tokenCount, cost, age, durationMsText]
    );
  }
  console.log(`[seed-e2e] traces + spans: ensured ${traces.length} fixture traces`);
}

async function seedWorkflows() {
  const existing = await pool.query(`SELECT id FROM workflows WHERE name = $1 LIMIT 1`, ["Daily Digest"]);
  let workflowId: number;

  if ((existing.rowCount ?? 0) > 0) {
    workflowId = existing.rows[0].id;
    console.log("[seed-e2e] workflows: 'Daily Digest' already exists, skipping create");
  } else {
    const res = await pool.query(
      `INSERT INTO workflows (name, description, definition, status, trigger_type, trigger_config, created_by, tenant_id)
       VALUES ($1, $2, $3::jsonb, 'active', 'scheduled', $4::jsonb, 'seed-e2e', 'transformate')
       RETURNING id`,
      [
        "Daily Digest",
        "E2E fixture workflow — summarizes daily activity",
        JSON.stringify({ nodes: [{ id: "start", type: "trigger" }], edges: [] }),
        JSON.stringify({ cron: "0 7 * * *" }),
      ]
    );
    workflowId = res.rows[0].id;
    console.log(`[seed-e2e] workflows: created 'Daily Digest' (id=${workflowId})`);
  }

  const existing2 = await pool.query(`SELECT 1 FROM workflows WHERE name = $1 LIMIT 1`, ["Lead Intake Router"]);
  if ((existing2.rowCount ?? 0) === 0) {
    await pool.query(
      `INSERT INTO workflows (name, description, definition, status, trigger_type, created_by, tenant_id)
       VALUES ($1, $2, $3::jsonb, 'draft', 'webhook', 'seed-e2e', 'transformate')`,
      [
        "Lead Intake Router",
        "E2E fixture workflow — routes intake submissions",
        JSON.stringify({ nodes: [], edges: [] }),
      ]
    );
    console.log("[seed-e2e] workflows: created 'Lead Intake Router'");
  }

  const runsExisting = await pool.query(`SELECT 1 FROM workflow_runs WHERE workflow_id = $1 LIMIT 1`, [workflowId]);
  if ((runsExisting.rowCount ?? 0) === 0) {
    await pool.query(
      `INSERT INTO workflow_runs (workflow_id, status, triggered_by, tenant_id, step_results, completed_at, created_at)
       VALUES
         ($1, 'completed', 'scheduler', 'transformate', '[]'::jsonb, NOW() - INTERVAL '23 hours', NOW() - INTERVAL '23 hours'),
         ($1, 'failed', 'manual', 'transformate', '[]'::jsonb, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')`,
      [workflowId]
    );
    console.log(`[seed-e2e] workflow_runs: seeded 2 runs for workflow id=${workflowId}`);
  }
}

async function seedMcpServers() {
  const servers: Array<[string, string, boolean, string]> = [
    ["Filesystem", "stdio", true, "Local filesystem access (E2E fixture)"],
    ["Git", "stdio", true, "Git repository operations (E2E fixture)"],
    ["Memory", "stdio", true, "Persistent memory store (E2E fixture)"],
  ];

  for (const [name, serverType, approved, notes] of servers) {
    const existing = await pool.query(`SELECT id FROM mcp_servers WHERE name = $1 LIMIT 1`, [name]);
    if ((existing.rowCount ?? 0) > 0) continue;
    const res = await pool.query(
      `INSERT INTO mcp_servers (name, server_type, approved, status, tenant_id, notes)
       VALUES ($1, $2, $3, 'online', 'default', $4)
       RETURNING id`,
      [name, serverType, approved, notes]
    );
    if (name === "Filesystem") {
      await pool.query(
        `INSERT INTO mcp_server_agents (mcp_server_id, agent_id, granted_by)
         VALUES ($1, 'lumina', 'seed-e2e')`,
        [res.rows[0].id]
      );
    }
  }
  console.log("[seed-e2e] mcp_servers: ensured Filesystem, Git, Memory");
}

async function seedTasks() {
  const tasks: Array<[string, string, string, string]> = [
    ["Review overnight threat alerts", "todo", "P2", "lumina"],
    ["Publish weekly content digest", "in_progress", "P3", "content-factory"],
    ["Rotate MCP gateway tokens", "done", "P3", "lumina"],
  ];
  for (const [title, status, priority, agentId] of tasks) {
    const existing = await pool.query(`SELECT 1 FROM tasks WHERE title = $1 LIMIT 1`, [title]);
    if ((existing.rowCount ?? 0) > 0) continue;
    await pool.query(
      `INSERT INTO tasks (agent_id, title, status, priority, assignee)
       VALUES ($1, $2, $3, $4, 'agent')`,
      [agentId, title, status, priority]
    );
  }
  console.log("[seed-e2e] tasks: ensured 3 fixture tasks");
}

async function seedNotifications() {
  const notifications: Array<[string, string, string, string, boolean]> = [
    ["workflow_failure", "warning", "Workflow 'Daily Digest' run failed", "The scheduled run hit a timeout.", false],
    ["budget", "info", "Monthly budget at 40%", "Lumina tenant spend is tracking under budget.", true],
    ["threat", "critical", "High-severity threat pattern detected", "Review the security overview for details.", false],
  ];
  for (const [type, severity, title, body, read] of notifications) {
    const existing = await pool.query(`SELECT 1 FROM notifications WHERE title = $1 LIMIT 1`, [title]);
    if ((existing.rowCount ?? 0) > 0) continue;
    await pool.query(
      `INSERT INTO notifications (tenant_id, type, severity, title, body, read)
       VALUES ('default', $1, $2, $3, $4, $5)`,
      [type, severity, title, body, read]
    );
  }
  console.log("[seed-e2e] notifications: ensured 3 fixture notifications");
}

async function seedIncidents() {
  // No migration currently creates an `incidents` table (src/app/api/incidents
  // queries it, but it doesn't exist on a from-scratch DB — see the seed-e2e
  // report / WI-1687 notes). Guard defensively so this script never errors
  // out if that gets fixed later or on an environment where it already exists.
  if (!(await tableExists("incidents"))) {
    console.log("[seed-e2e] incidents: table does not exist yet (missing migration) — skipping");
    return;
  }
  const existing = await pool.query(`SELECT 1 FROM incidents WHERE title = $1 LIMIT 1`, ["E2E fixture incident"]);
  if ((existing.rowCount ?? 0) > 0) {
    console.log("[seed-e2e] incidents: already seeded, skipping");
    return;
  }
  await pool.query(
    `INSERT INTO incidents (tenant_id, title, description, severity, status, created_by)
     VALUES ('transformate', 'E2E fixture incident', 'Seeded for E2E coverage', 'P3', 'created', 'seed-e2e')`
  );
  console.log("[seed-e2e] incidents: seeded 1 fixture incident");
}

async function run() {
  console.log("[seed-e2e] Starting E2E fixture seed...");
  await seedTenants();
  await seedAgents();
  await seedEvents();
  await seedSessions();
  await seedDailyStats();
  await seedTraces();
  await seedWorkflows();
  await seedMcpServers();
  await seedTasks();
  await seedNotifications();
  await seedIncidents();
  console.log("[seed-e2e] Done.");
  await pool.end();
}

run().catch((err) => {
  console.error("[seed-e2e] Fatal:", err);
  process.exit(1);
});
