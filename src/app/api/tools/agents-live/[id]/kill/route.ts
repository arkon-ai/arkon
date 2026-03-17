import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../../../_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query(
      `UPDATE subagent_runs
       SET status = 'killed',
           completed_at = NOW(),
           error_message = COALESCE(error_message, 'Killed from Arkon')
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: result.rows[0] });
  } catch (error) {
    console.error("[tools/agents-live/:id/kill] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
