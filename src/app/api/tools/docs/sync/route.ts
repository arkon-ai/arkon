import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseJsonRecord, parseTextArray, unauthorized, forbidden, validateRole } from "../../_utils";

export async function POST(req: NextRequest) {
  // RBAC: owner only — docs sync pushes workspace files into DB
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Docs sync requires owner role");

  try {
    const body = await req.json();
    const documents = Array.isArray(body.documents) ? body.documents : [];

    if (!documents.length) {
      return NextResponse.json({ error: "documents array is required" }, { status: 400 });
    }

    const inserted = [];

    for (const doc of documents) {
      if (!doc?.title || !doc?.category || !doc?.content || !doc?.agent_id) continue;
      const content = String(doc.content);
      const result = await query(
        `INSERT INTO documents (
          agent_id, title, category, content, content_format, file_path, tags, pinned,
          metadata, word_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, FALSE), $9, $10)
        RETURNING id, title`,
        [
          doc.agent_id,
          doc.title,
          doc.category,
          content,
          doc.content_format ?? "markdown",
          doc.file_path ?? null,
          parseTextArray(doc.tags),
          doc.pinned ?? false,
          JSON.stringify(parseJsonRecord(doc.metadata)),
          doc.word_count ?? content.split(/\s+/).filter(Boolean).length,
        ]
      );

      inserted.push(result.rows[0]);
    }

    return NextResponse.json({ ok: true, insertedCount: inserted.length, items: inserted });
  } catch (error) {
    console.error("[tools/docs/sync] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
