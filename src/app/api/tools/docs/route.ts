import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  parseInteger,
  parseJsonRecord,
  parseTextArray,
  unauthorized,
  validateAdmin,
} from "../_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const search = req.nextUrl.searchParams.get("search");
    const category = req.nextUrl.searchParams.get("category");
    const pinned = req.nextUrl.searchParams.get("pinned");
    const limit = Math.min(parseInteger(req.nextUrl.searchParams.get("limit"), 50), 200);
    const offset = Math.max(parseInteger(req.nextUrl.searchParams.get("offset"), 0), 0);

    const filters: string[] = [];
    const values: unknown[] = [];

    if (search) {
      values.push(search);
      filters.push(`search_vector @@ websearch_to_tsquery('english', $${values.length})`);
    }

    if (category && category !== "all") {
      values.push(category);
      filters.push(`category = $${values.length}`);
    }

    if (pinned === "true") {
      filters.push("pinned = TRUE");
    }

    values.push(limit);
    values.push(offset);

    const result = await query(
      `SELECT id, agent_id, title, category, content_format, file_path, tags, pinned, metadata,
              created_at, updated_at, word_count,
              LEFT(content, 240) AS preview
       FROM documents
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY pinned DESC, updated_at DESC
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values
    );

    return NextResponse.json({
      items: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[tools/docs] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();

    if (!body.title || !body.category || !body.content || !body.agent_id) {
      return NextResponse.json(
        { error: "agent_id, title, category, and content are required" },
        { status: 400 }
      );
    }

    const content = String(body.content);
    const result = await query(
      `INSERT INTO documents (
        agent_id, title, category, content, content_format, file_path, tags, pinned,
        metadata, word_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, FALSE), $9, $10)
      RETURNING id, agent_id, title, category, content_format, file_path, tags, pinned, metadata,
                created_at, updated_at, word_count`,
      [
        body.agent_id,
        body.title,
        body.category,
        content,
        body.content_format ?? "markdown",
        body.file_path ?? null,
        parseTextArray(body.tags),
        body.pinned ?? false,
        JSON.stringify(parseJsonRecord(body.metadata)),
        body.word_count ?? content.split(/\s+/).filter(Boolean).length,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("[tools/docs] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
