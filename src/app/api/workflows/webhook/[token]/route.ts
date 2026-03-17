// src/app/api/workflows/webhook/[token]/route.ts — Webhook trigger endpoint
// Workflow v3: Accepts POST, looks up workflow by webhook_token, executes it
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runWorkflow, type WorkflowRecord } from "@/lib/workflow-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 16) {
      return NextResponse.json({ error: "Invalid webhook token" }, { status: 400 });
    }

    // Look up workflow by webhook_token
    const result = await query(
      `SELECT id, name, definition, status, trigger_type, trigger_config, tenant_id
       FROM workflows
       WHERE webhook_token = $1 AND status = 'active' AND trigger_type = 'webhook'
       LIMIT 1`,
      [token]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Webhook not found or inactive" }, { status: 404 });
    }

    const workflow = result.rows[0] as WorkflowRecord;

    // Parse webhook payload and inject into workflow context
    let payload: Record<string, unknown> = {};
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        payload = (await req.json()) as Record<string, unknown>;
      } else {
        payload = { body: await req.text() };
      }
    } catch {
      // Empty body is fine
    }

    // Inject webhook payload into the trigger node's data
    const definition = { ...workflow.definition };
    const triggerNode = definition.nodes?.find(
      (n) => n.type === "webhook-trigger" || n.type === "manual-trigger" || n.type === "cron-trigger"
    );
    if (triggerNode) {
      triggerNode.data = { ...triggerNode.data, webhookPayload: payload };
    }

    const modifiedWorkflow = { ...workflow, definition };

    // Execute
    const execResult = await runWorkflow(modifiedWorkflow, "webhook");

    return NextResponse.json({
      run_id: execResult.runId,
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      status: execResult.status,
      steps: execResult.steps.length,
      error: execResult.error ?? null,
      ok: execResult.status === "completed",
    });
  } catch (err) {
    console.error("[workflows/webhook] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: Health check / info for the webhook
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const result = await query(
      `SELECT id, name, status, trigger_type, run_count, last_run_at
       FROM workflows
       WHERE webhook_token = $1
       LIMIT 1`,
      [token]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    const wf = result.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      webhook_active: wf.status === "active" && wf.trigger_type === "webhook",
      workflow_name: wf.name,
      run_count: wf.run_count,
      last_run_at: wf.last_run_at,
    });
  } catch (err) {
    console.error("[workflows/webhook] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
