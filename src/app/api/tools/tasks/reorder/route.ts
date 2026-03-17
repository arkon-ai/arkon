import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../../_utils";

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];

    for (const item of items) {
      if (!item?.id) continue;
      await query(
        `UPDATE tasks
         SET status = COALESCE($2, status),
             sort_order = COALESCE($3, sort_order),
             updated_at = NOW()
         WHERE id = $1`,
        [item.id, item.status ?? null, item.sort_order ?? null]
      );
    }

    return NextResponse.json({ ok: true, updatedCount: items.length });
  } catch (error) {
    console.error("[tools/tasks/reorder] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
