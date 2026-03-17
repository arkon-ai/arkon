// src/app/api/workflows/[id]/run/route.ts — Execute workflow (manual trigger)
// Phase 5b: Refactored to use shared workflow engine
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { runWorkflow, type WorkflowRecord } from "@/lib/workflow-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;

    // Fetch workflow
    const wf = await query(`SELECT * FROM workflows WHERE id = $1`, [id]);
    if (wf.rowCount === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const workflow = wf.rows[0] as WorkflowRecord;

    // Execute via shared engine
    const result = await runWorkflow(workflow, "manual");

    return NextResponse.json({
      run_id: result.runId,
      status: result.status,
      steps: result.steps,
      error: result.error ?? null,
      ok: result.status === "completed",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[workflows/run] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
