import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

/* ─── GET — list agent mappings for a server ────────────── */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await params;
  const serverId = parseInt(id, 10);
  if (!serverId) return NextResponse.json({ error: "Invalid server id" }, { status: 400 });

  const result = await query(
    `SELECT ma.agent_id, a.name as agent_name, ma.granted_at, ma.granted_by
     FROM mcp_server_agents ma
     JOIN agents a ON a.id = ma.agent_id
     WHERE ma.mcp_server_id = $1
     ORDER BY ma.granted_at DESC`,
    [serverId]
  );

  return NextResponse.json({ agents: result.rows, count: result.rowCount });
}

/* ─── POST — assign agents to a server ──────────────────── */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await params;
  const serverId = parseInt(id, 10);
  if (!serverId) return NextResponse.json({ error: "Invalid server id" }, { status: 400 });

  const body = await req.json() as { agent_ids: string[] };
  if (!Array.isArray(body.agent_ids) || body.agent_ids.length === 0) {
    return NextResponse.json({ error: "agent_ids array required" }, { status: 400 });
  }

  let added = 0;
  for (const agentId of body.agent_ids) {
    try {
      await query(
        `INSERT INTO mcp_server_agents (mcp_server_id, agent_id, granted_by)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (mcp_server_id, agent_id) DO NOTHING`,
        [serverId, agentId]
      );
      added++;
    } catch {
      // skip invalid agent_ids
    }
  }

  return NextResponse.json({ ok: true, added });
}

/* ─── DELETE — remove agent from server ─────────────────── */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await params;
  const serverId = parseInt(id, 10);
  const agentId = req.nextUrl.searchParams.get("agent_id");
  if (!serverId || !agentId) {
    return NextResponse.json({ error: "server id and agent_id required" }, { status: 400 });
  }

  await query(
    "DELETE FROM mcp_server_agents WHERE mcp_server_id = $1 AND agent_id = $2",
    [serverId, agentId]
  );

  return NextResponse.json({ ok: true });
}
