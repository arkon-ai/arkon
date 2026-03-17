// src/lib/workflow-engine.ts — Shared workflow execution engine
// Extracted from workflows-run-route.ts for reuse by cron scheduler
// Phase 5b: Cron Trigger Support

import { query } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StepResult {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "success" | "failed" | "skipped";
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRecord {
  id: number;
  name: string;
  definition: WorkflowDefinition;
  status: string;
  trigger_type: string;
  trigger_config: { cron_expression?: string } | null;
  tenant_id: string;
}

export interface ExecutionResult {
  runId: number;
  status: "completed" | "failed";
  steps: StepResult[];
  error?: string;
}

// ── Template interpolation ─────────────────────────────────────────────────────

function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] !== undefined ? String(context[key]) : `{{${key}}}`;
  });
}

// ── Node executors ─────────────────────────────────────────────────────────────

async function executeHttpRequest(data: Record<string, unknown>, context: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const url = interpolateTemplate(String(data.url ?? ""), context);
  const method = String(data.method ?? "GET").toUpperCase();
  const timeout = Number(data.timeout ?? 10000);
  const headers: Record<string, string> = {};

  if (data.headers && typeof data.headers === "object") {
    for (const [k, v] of Object.entries(data.headers as Record<string, string>)) {
      headers[k] = interpolateTemplate(v, context);
    }
  }

  // Auto-inject Bearer token for internal MC API calls
  if (!headers["authorization"] && !headers["Authorization"]) {
    const mcToken = process.env.MC_ADMIN_TOKEN;
    if (mcToken && (url.includes("mc.transformateai.com") || url.startsWith("http://127.0.0.1:4000"))) {
      headers["authorization"] = `Bearer ${mcToken}`;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const opts: RequestInit = { method, headers, signal: controller.signal };
    if (method !== "GET" && method !== "HEAD" && data.body) {
      opts.body = typeof data.body === "string"
        ? interpolateTemplate(data.body, context)
        : JSON.stringify(data.body);
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }

    const res = await fetch(url, opts);
    let body: unknown;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      body = await res.json();
    } else {
      const text = await res.text();
      body = text.length > 2000 ? text.slice(0, 2000) + "\u2026" : text;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function evaluateCondition(data: Record<string, unknown>, context: Record<string, unknown>): boolean {
  const field = String(data.field ?? "status");
  const operator = String(data.operator ?? "eq");
  const expected = String(data.value ?? "");
  const actual = String(context[field] ?? "");

  switch (operator) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "gt": return Number(actual) > Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "contains": return actual.includes(expected);
    case "not_contains": return !actual.includes(expected);
    default: return actual === expected;
  }
}

async function executeNotify(data: Record<string, unknown>, context: Record<string, unknown>): Promise<{ sent: boolean; channel: string }> {
  const channel = String(data.channel ?? "telegram");
  const message = interpolateTemplate(String(data.message ?? "Workflow notification"), context);

  if (channel === "telegram") {
    try {
      const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
      if (gatewayUrl) {
        const res = await fetch(`${gatewayUrl}/api/notify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channel: "telegram", message }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return { sent: true, channel };
      }
    } catch {
      // Fall through to direct API
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
          signal: AbortSignal.timeout(5000),
        });
        return { sent: true, channel };
      } catch {
        return { sent: false, channel };
      }
    }

    return { sent: false, channel };
  }

  console.log(`[workflow-notify] ${channel}: ${message}`);
  return { sent: true, channel: "log" };
}

// ── Agent Action executor (calls OpenClaw gateway tool) ─────────────────────

async function executeAgentAction(
  data: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  if (!gatewayUrl) {
    return { status: 503, body: { error: "OPENCLAW_GATEWAY_URL not configured" } };
  }

  const toolName = interpolateTemplate(String(data.tool ?? ""), context);
  const agentId = interpolateTemplate(String(data.agent_id ?? ""), context);
  const toolInput = data.input && typeof data.input === "object"
    ? JSON.parse(interpolateTemplate(JSON.stringify(data.input), context))
    : {};
  const timeout = Number(data.timeout ?? 15000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${gatewayUrl}/api/tools/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: toolName, agent_id: agentId, input: toolInput }),
      signal: controller.signal,
    });

    let body: unknown;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    return { status: res.status, body };
  } catch (err) {
    return {
      status: 500,
      body: { error: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Executor engine ────────────────────────────────────────────────────────────

export async function executeWorkflow(definition: WorkflowDefinition): Promise<{ steps: StepResult[]; error?: string }> {
  const { nodes, edges } = definition;
  const steps: StepResult[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const context: Record<string, unknown> = {};

  // Find any trigger node (manual-trigger, cron-trigger, or webhook-trigger)
  const triggerNode = nodes.find((n) =>
    n.type === "manual-trigger" || n.type === "cron-trigger" || n.type === "webhook-trigger"
  );
  if (!triggerNode) {
    return { steps, error: "No trigger node found" };
  }

  // Inject webhook payload into context if present
  if (triggerNode.data?.webhookPayload) {
    context.webhookPayload = triggerNode.data.webhookPayload;
    const payload = triggerNode.data.webhookPayload as Record<string, unknown>;
    for (const [k, v] of Object.entries(payload)) {
      context[`webhook_${k}`] = typeof v === "string" ? v : JSON.stringify(v);
    }
  }

  // BFS walk from trigger
  const visited = new Set<string>();
  const queue: string[] = [triggerNode.id];

  steps.push({
    nodeId: triggerNode.id,
    nodeType: triggerNode.type,
    label: String(triggerNode.data?.label ?? "Trigger"),
    status: "success",
    output: { triggered: true, at: new Date().toISOString() },
    durationMs: 0,
  });
  visited.add(triggerNode.id);

  function getNextNodes(nodeId: string, handle?: string): string[] {
    return edges
      .filter((e) => e.source === nodeId && (handle === undefined || e.sourceHandle === handle))
      .map((e) => e.target);
  }

  const nextFromTrigger = getNextNodes(triggerNode.id);
  queue.length = 0;
  queue.push(...nextFromTrigger);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = nodeMap.get(currentId);
    if (!node) continue;

    const start = Date.now();
    let stepResult: StepResult;

    try {
      switch (node.type) {
        case "http-request": {
          const result = await executeHttpRequest(node.data, context);
          context.status = String(result.status);
          context.body = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
          context.httpStatus = result.status;
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            label: String(node.data?.label ?? "HTTP Request"),
            status: "success",
            output: result,
            durationMs: Date.now() - start,
          };
          queue.push(...getNextNodes(node.id));
          break;
        }

        case "condition": {
          const passed = evaluateCondition(node.data, context);
          context.conditionResult = passed;
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            label: String(node.data?.label ?? "Condition"),
            status: "success",
            output: { passed, field: node.data.field, operator: node.data.operator, value: node.data.value },
            durationMs: Date.now() - start,
          };
          const trueTargets = getNextNodes(node.id, "true");
          const falseTargets = getNextNodes(node.id, "false");
          if (passed) {
            queue.push(...trueTargets);
            for (const ft of falseTargets) {
              if (!visited.has(ft)) {
                const fn = nodeMap.get(ft);
                steps.push({
                  nodeId: ft,
                  nodeType: fn?.type ?? "unknown",
                  label: String(fn?.data?.label ?? ft),
                  status: "skipped",
                  output: { reason: "condition was true" },
                  durationMs: 0,
                });
                visited.add(ft);
              }
            }
          } else {
            queue.push(...falseTargets);
            for (const tt of trueTargets) {
              if (!visited.has(tt)) {
                const tn = nodeMap.get(tt);
                steps.push({
                  nodeId: tt,
                  nodeType: tn?.type ?? "unknown",
                  label: String(tn?.data?.label ?? tt),
                  status: "skipped",
                  output: { reason: "condition was false" },
                  durationMs: 0,
                });
                visited.add(tt);
              }
            }
          }
          break;
        }

        case "notify": {
          const result = await executeNotify(node.data, context);
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            label: String(node.data?.label ?? "Notify"),
            status: result.sent ? "success" : "failed",
            output: result,
            durationMs: Date.now() - start,
          };
          queue.push(...getNextNodes(node.id));
          break;
        }

        case "agent-action": {
          const result = await executeAgentAction(node.data, context);
          context.agentActionResult = result.body;
          context.agentActionStatus = result.status;
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            label: String(node.data?.label ?? "Agent Action"),
            status: result.status >= 200 && result.status < 300 ? "success" : "failed",
            output: result,
            durationMs: Date.now() - start,
          };
          queue.push(...getNextNodes(node.id));
          break;
        }

        default: {
          stepResult = {
            nodeId: node.id,
            nodeType: node.type,
            label: String(node.data?.label ?? node.type),
            status: "skipped",
            output: { reason: `Unknown node type: ${node.type}` },
            durationMs: 0,
          };
          queue.push(...getNextNodes(node.id));
        }
      }
    } catch (err) {
      stepResult = {
        nodeId: node.id,
        nodeType: node.type,
        label: String(node.data?.label ?? node.type),
        status: "failed",
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
      steps.push(stepResult);
      return { steps, error: stepResult.error };
    }

    steps.push(stepResult);
  }

  return { steps };
}

// ── Full run lifecycle (create record, execute, update) ────────────────────────

export async function runWorkflow(
  workflow: WorkflowRecord,
  triggeredBy: "manual" | "cron" | "webhook" = "manual"
): Promise<ExecutionResult> {
  // Create run record
  const runResult = await query(
    `INSERT INTO workflow_runs (workflow_id, status, triggered_by, tenant_id)
     VALUES ($1, 'running', $2, $3) RETURNING id`,
    [workflow.id, triggeredBy, workflow.tenant_id]
  );
  const runId = (runResult.rows[0] as { id: number }).id;

  // Execute (sandboxed)
  let execResult: { steps: StepResult[]; error?: string };
  try {
    execResult = await executeWorkflow(workflow.definition);
  } catch (err) {
    execResult = {
      steps: [],
      error: err instanceof Error ? err.message : "Unexpected execution error",
    };
  }

  const finalStatus = execResult.error ? "failed" : "completed";

  // Update run record
  await query(
    `UPDATE workflow_runs SET status = $1, completed_at = NOW(), step_results = $2, error = $3 WHERE id = $4`,
    [finalStatus, JSON.stringify(execResult.steps), execResult.error ?? null, runId]
  );

  // Update workflow stats
  await query(
    `UPDATE workflows SET last_run_at = NOW(), run_count = run_count + 1, updated_at = NOW() WHERE id = $1`,
    [workflow.id]
  );

  return {
    runId,
    status: finalStatus as "completed" | "failed",
    steps: execResult.steps,
    error: execResult.error,
  };
}
