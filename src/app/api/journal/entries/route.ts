/**
 * /api/journal/entries — list + create work_entries
 *
 * GET: list (readable by any authenticated actor in tenant; supports filters)
 * POST: create (RBAC: actor must be governor OR requested owner_agent)
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authorizeJournalActor, canCreateAs } from "@/lib/journal-auth";
import { broadcast } from "@/lib/event-bus";
// Note: event-bus.broadcast takes {type, payload} — journal events use
// type='journal' with payload containing the detail.

const ALLOWED_CATEGORIES = ["task", "log", "decision", "insight", "question", "blocker", "ship", "note"];
const ALLOWED_STATUS = ["todo", "in_progress", "done", "blocked", "cancelled", "log"];

export async function GET(request: NextRequest) {
  const actor = await authorizeJournalActor(request.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);
  const owner = url.searchParams.get("owner");
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const project = url.searchParams.get("project");
  const q = url.searchParams.get("q");

  const conditions: string[] = ["we.tenant_id = $1"];
  const params: unknown[] = [actor.tenantId];
  let p = 2;

  if (owner) { conditions.push(`we.owner_agent = $${p++}`); params.push(owner); }
  if (status) { conditions.push(`we.status = $${p++}`); params.push(status); }
  if (category) { conditions.push(`we.category = $${p++}`); params.push(category); }
  if (project) { conditions.push(`we.related_project = $${p++}`); params.push(project); }
  if (q) { conditions.push(`we.search_vector @@ plainto_tsquery('english', $${p++})`); params.push(q); }

  const sql = `
    SELECT we.id, we.owner_agent, ai.display_name AS owner_display_name, ai.emoji AS owner_emoji,
           we.parent_id, we.category, we.status, we.priority,
           we.title, we.body_md, we.links, we.tags, we.related_project,
           we.occurred_at, we.due_at, we.completed_at,
           we.created_at, we.updated_at
    FROM work_entries we
    JOIN agent_identities ai ON ai.slug = we.owner_agent
    WHERE ${conditions.join(" AND ")}
    ORDER BY we.occurred_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const { rows } = await query(sql, params);
  return NextResponse.json({ entries: rows, count: rows.length });
}

export async function POST(request: NextRequest) {
  const actor = await authorizeJournalActor(request.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const category = String(body.category || "log");
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of ${ALLOWED_CATEGORIES.join(", ")}` }, { status: 400 });
  }

  const ownerAgent = String(body.owner_agent || actor.slug);
  if (!canCreateAs(actor, ownerAgent)) {
    return NextResponse.json({ error: `cannot create entry as '${ownerAgent}' — only governors or self-owned writes allowed` }, { status: 403 });
  }

  const status = String(body.status || "log");
  if (!ALLOWED_STATUS.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${ALLOWED_STATUS.join(", ")}` }, { status: 400 });
  }

  const priority = Math.max(1, Math.min(5, parseInt(String(body.priority ?? "3"), 10) || 3));
  const bodyMd = body.body_md ? String(body.body_md) : null;
  const links = Array.isArray(body.links) ? body.links : [];
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  const project = body.related_project ? String(body.related_project) : null;
  const occurredAt = body.occurred_at ? new Date(String(body.occurred_at)) : new Date();
  const dueAt = body.due_at ? new Date(String(body.due_at)) : null;
  const parentId = body.parent_id != null ? Number(body.parent_id) : null;

  const { rows } = await query(
    `
    INSERT INTO work_entries
      (tenant_id, owner_agent, parent_id, category, status, priority,
       title, body_md, links, tags, related_project,
       occurred_at, due_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::text[],$11,$12,$13)
    RETURNING id, owner_agent, category, status, priority, title, body_md, links, tags,
              related_project, occurred_at, due_at, created_at, updated_at
    `,
    [actor.tenantId, ownerAgent, parentId, category, status, priority,
     title, bodyMd, JSON.stringify(links), tags, project, occurredAt, dueAt]
  );
  const entry = rows[0];

  // Live-broadcast to any SSE subscribers on /api/journal/stream
  try {
    broadcast({ type: "journal.entry.created", payload: { tenant_id: actor.tenantId, entry } });
  } catch { /* broadcast best-effort */ }

  return NextResponse.json({ entry }, { status: 201 });
}
