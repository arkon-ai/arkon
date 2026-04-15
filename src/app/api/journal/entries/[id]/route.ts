/**
 * /api/journal/entries/[id] — read, update, delete a single entry
 *
 * GET:   readable by any authenticated actor in tenant
 * PATCH: RBAC — actor must be governor OR entry owner
 * DELETE: governors only (agents soft-cancel via status='cancelled')
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeJournalActor, canWriteEntry } from "@/lib/journal-auth";
import { broadcast } from "@/lib/event-bus";

async function loadEntry(id: number, tenantId: string) {
  const { rows } = await query(
    `SELECT * FROM work_entries WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, tenantId]
  );
  return rows[0] ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await authorizeJournalActor(request.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await loadEntry(Number(id), actor.tenantId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ entry });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await authorizeJournalActor(request.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry = await loadEntry(Number(id), actor.tenantId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canWriteEntry(actor, entry.owner_agent)) {
    return NextResponse.json(
      { error: `cannot modify entry owned by '${entry.owner_agent}' — you are '${actor.slug}'` },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const patchFields: Record<string, unknown> = {};
  const simpleFields = ["title", "body_md", "category", "status", "priority", "related_project"];
  for (const f of simpleFields) {
    if (f in body) patchFields[f] = body[f];
  }
  if ("tags" in body && Array.isArray(body.tags)) patchFields.tags = body.tags.map(String);
  if ("links" in body && Array.isArray(body.links)) patchFields.links = body.links;
  if ("due_at" in body) patchFields.due_at = body.due_at ? new Date(String(body.due_at)) : null;
  if ("completed_at" in body) patchFields.completed_at = body.completed_at ? new Date(String(body.completed_at)) : null;

  // Auto-set completed_at when status flips to done
  if (patchFields.status === "done" && !("completed_at" in patchFields)) {
    patchFields.completed_at = new Date();
  }

  if (Object.keys(patchFields).length === 0) {
    return NextResponse.json({ entry });
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (const [k, v] of Object.entries(patchFields)) {
    if (k === "tags") {
      setClauses.push(`tags = $${p++}::text[]`);
      values.push(v);
    } else if (k === "links") {
      setClauses.push(`links = $${p++}::jsonb`);
      values.push(JSON.stringify(v));
    } else {
      setClauses.push(`${k} = $${p++}`);
      values.push(v);
    }
  }
  values.push(Number(id), actor.tenantId);

  const { rows } = await query(
    `UPDATE work_entries SET ${setClauses.join(", ")} WHERE id = $${p++} AND tenant_id = $${p++} RETURNING *`,
    values
  );

  try { broadcast({ type: "journal.entry.updated", payload: { tenant_id: actor.tenantId, entry: rows[0] } }); } catch {}

  return NextResponse.json({ entry: rows[0] });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await authorizeJournalActor(request.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (actor.role !== "governor") {
    return NextResponse.json({ error: "delete requires governor role — use PATCH status=cancelled instead" }, { status: 403 });
  }

  const entry = await loadEntry(Number(id), actor.tenantId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await query(`DELETE FROM work_entries WHERE id = $1 AND tenant_id = $2`, [Number(id), actor.tenantId]);

  try { broadcast({ type: "journal.entry.deleted", payload: { tenant_id: actor.tenantId, entry_id: Number(id) } }); } catch {}

  return NextResponse.json({ ok: true });
}
