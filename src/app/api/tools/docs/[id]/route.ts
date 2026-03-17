import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  parseJsonRecord,
  parseTextArray,
  unauthorized,
  validateAdmin,
} from "../../_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("SELECT * FROM documents WHERE id = $1", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/docs/:id] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = await req.json();
    const content =
      typeof body.content === "string"
        ? body.content
        : typeof body.title === "string"
          ? undefined
          : null;

    const result = await query(
      `UPDATE documents
       SET title = COALESCE($2, title),
           category = COALESCE($3, category),
           content = COALESCE($4, content),
           content_format = COALESCE($5, content_format),
           file_path = COALESCE($6, file_path),
           tags = COALESCE($7, tags),
           pinned = COALESCE($8, pinned),
           metadata = COALESCE($9, metadata),
           word_count = COALESCE($10, word_count),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.title ?? null,
        body.category ?? null,
        content ?? null,
        body.content_format ?? null,
        body.file_path ?? null,
        Array.isArray(body.tags) ? parseTextArray(body.tags) : null,
        typeof body.pinned === "boolean" ? body.pinned : null,
        body.metadata ? JSON.stringify(parseJsonRecord(body.metadata)) : null,
        typeof content === "string"
          ? content.split(/\s+/).filter(Boolean).length
          : body.word_count ?? null,
      ]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/docs/:id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM documents WHERE id = $1 RETURNING id", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error("[tools/docs/:id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
