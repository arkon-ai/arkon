import { NextRequest, NextResponse } from "next/server";
import { checkAnomalies, recomputeBaselines } from "@/lib/anomaly-detector";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

/**
 * POST /api/cron/baseline
 * Called every 5 minutes by PM2 cron.
 * action=check  → run anomaly check (default)
 * action=recompute → recompute 7-day baselines (nightly)
 */
export async function POST(req: NextRequest) {
  // Allow internal cron calls with CRON_SECRET or admin token
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const providedSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const isValidCron = cronSecret && providedSecret === cronSecret;
  const isAdmin = !isValidCron && validateAdmin(req);

  if (!isValidCron && !isAdmin) return unauthorized("Cron secret or admin token required");

  const { action = "check" } = await req.json().catch(() => ({ action: "check" })) as { action?: string };

  try {
    if (action === "recompute") {
      await recomputeBaselines();
      return NextResponse.json({ ok: true, action: "recompute", timestamp: new Date().toISOString() });
    } else {
      await checkAnomalies();
      return NextResponse.json({ ok: true, action: "check", timestamp: new Date().toISOString() });
    }
  } catch (err) {
    console.error("[cron/baseline] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
