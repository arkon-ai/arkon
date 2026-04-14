import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { forbidden, unauthorized, validateRole } from "@/app/api/tools/_utils";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH — toggle enabled / update max_videos / rename.
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const { id } = await ctx.params;
  const channelId = Number.parseInt(id, 10);
  if (!Number.isFinite(channelId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = (await req.json()) as {
    enabled?: boolean;
    max_videos?: number;
    name?: string;
  };

  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (typeof body.enabled === "boolean") {
    sets.push(`enabled = $${i++}`);
    params.push(body.enabled);
  }
  if (typeof body.max_videos === "number") {
    sets.push(`max_videos = $${i++}`);
    params.push(Math.min(Math.max(body.max_videos, 1), 500));
  }
  if (typeof body.name === "string" && body.name.trim()) {
    sets.push(`name = $${i++}`);
    params.push(body.name.trim());
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  sets.push("updated_at = NOW()");
  params.push(channelId);

  const result = await query(
    `UPDATE youtube_channels SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, channel: result.rows[0] });
}

// DELETE — remove a channel. Does NOT touch ChromaDB or Dell files.
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const { id } = await ctx.params;
  const channelId = Number.parseInt(id, 10);
  if (!Number.isFinite(channelId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const result = await query("DELETE FROM youtube_channels WHERE id = $1 RETURNING id", [channelId]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: channelId });
}
