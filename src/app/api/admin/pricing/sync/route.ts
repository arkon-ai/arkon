import { NextRequest, NextResponse } from "next/server";
import { isOwnerOrAdmin, unauthorized } from "@/app/api/tools/_utils";
import { syncOpenRouterPricing } from "@/lib/openrouter-sync";

export async function POST(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  try {
    const result = await syncOpenRouterPricing();

    return NextResponse.json({
      ok: true,
      ...result,
      message: `Synced ${result.total_fetched} models: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged`,
    });
  } catch (err) {
    console.error("[admin/pricing/sync] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await isOwnerOrAdmin(req))) return unauthorized();

  // Return last sync status
  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT notes FROM model_pricing
       WHERE provider = '_system' AND model_id = '_openrouter_sync'
       ORDER BY effective_from DESC LIMIT 1`
    );

    const lastSync = result.rows[0]?.notes ? JSON.parse(result.rows[0].notes) : null;

    return NextResponse.json({
      last_sync: lastSync,
      openrouter_models: lastSync?.total_fetched || 0,
    });
  } catch (err) {
    console.error("[admin/pricing/sync] GET Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
