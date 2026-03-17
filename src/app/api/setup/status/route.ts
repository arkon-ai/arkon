import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/setup/status — public endpoint
 * Returns whether initial setup has been completed.
 * Used by the app shell to redirect first-run users to /setup.
 */
export async function GET() {
  try {
    const result = await query(
      "SELECT setup_completed FROM tenants WHERE setup_completed = TRUE LIMIT 1"
    );
    const rows = result.rows as Array<{ setup_completed: boolean }>;

    if (rows.length === 0) {
      // No completed setup found — first run
      return NextResponse.json({ setup_completed: false, needs_setup: true });
    }

    return NextResponse.json({
      setup_completed: true,
      needs_setup: false,
    });
  } catch {
    // DB not reachable or column doesn't exist yet — assume needs setup
    return NextResponse.json({ setup_completed: false, needs_setup: true });
  }
}
