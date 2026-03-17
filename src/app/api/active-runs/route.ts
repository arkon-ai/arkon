import { NextRequest, NextResponse } from "next/server";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { getRuns, getRunsByAgent } from "@/lib/active-runs";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const agentId = req.nextUrl.searchParams.get("agent_id");
  const runs = agentId ? getRunsByAgent(agentId) : getRuns();

  return NextResponse.json({
    runs,
    count: runs.length,
    timestamp: new Date().toISOString(),
  });
}
