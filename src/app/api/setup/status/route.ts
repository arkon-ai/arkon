import { NextResponse } from "next/server";
import { readSetupState } from "@/lib/setup-guard";

/**
 * GET /api/setup/status — public endpoint
 * Returns whether initial setup has been completed.
 * Used by the app shell to redirect first-run users to /setup.
 */
export async function GET() {
  try {
    // Same lock as POST /api/setup/complete (transformate WI-3991): an install in use is "completed",
    // so the wizard is never offered where every step would be refused.
    const { locked } = await readSetupState();

    if (!locked) {
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
