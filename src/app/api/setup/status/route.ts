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
      "SELECT setup_completed FROM tenants WHERE id = 'default' LIMIT 1"
    );
    const rows = result.rows as Array<{ setup_completed: boolean }>;

    if (rows.length === 0) {
      // No tenant row yet — definitely first run
      return NextResponse.json({ setup_completed: false, needs_setup: true });
    }

    return NextResponse.json({
      setup_completed: rows[0].setup_completed,
      needs_setup: !rows[0].setup_completed,
    });
  } catch {
    // DB not reachable or column doesn't exist yet — assume needs setup
    return NextResponse.json({ setup_completed: false, needs_setup: true });
  }
}
