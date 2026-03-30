import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Content Factory status — receives push from Dell reporter or serves cached data
// POST: Dell pushes status JSON (Bearer auth)
// GET: Dashboard reads latest status (admin auth)

let cachedStatus: Record<string, unknown> | null = null;
let cachedAt: Date | null = null;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const validToken = process.env.MC_ADMIN_TOKEN || process.env.CRON_SECRET;

  if (
    !token ||
    !validToken ||
    Buffer.byteLength(token) !== Buffer.byteLength(validToken) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(validToken))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Store in DB for historical tracking
    await query(
      `INSERT INTO cf_status_snapshots (data, created_at)
       VALUES ($1, NOW())`,
      [JSON.stringify(body)]
    );

    // Prune old snapshots (keep 7 days)
    await query(
      `DELETE FROM cf_status_snapshots WHERE created_at < NOW() - INTERVAL '7 days'`
    );

    // Cache for GET
    cachedStatus = body;
    cachedAt = new Date();

    return NextResponse.json({ ok: true, received_at: new Date().toISOString() });
  } catch (e) {
    console.error("CF status POST error:", e);
    return NextResponse.json(
      { error: "Failed to process status" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const cookieToken = req.cookies.get("mc_token")?.value;
  const validToken = process.env.MC_ADMIN_TOKEN;

  const checkToken = token || cookieToken;
  if (
    !checkToken ||
    !validToken ||
    Buffer.byteLength(checkToken) !== Buffer.byteLength(validToken) ||
    !timingSafeEqual(Buffer.from(checkToken), Buffer.from(validToken))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return cached if fresh (< 5 min)
  if (cachedStatus && cachedAt) {
    const ageMs = Date.now() - cachedAt.getTime();
    if (ageMs < 5 * 60 * 1000) {
      return NextResponse.json({
        ...cachedStatus,
        _cached: true,
        _age_seconds: Math.round(ageMs / 1000),
      });
    }
  }

  // Fall back to latest DB snapshot
  try {
    const result = await query(
      `SELECT data, created_at FROM cf_status_snapshots ORDER BY created_at DESC LIMIT 1`
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      const data =
        typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      return NextResponse.json({
        ...data,
        _from_db: true,
        _snapshot_at: row.created_at,
      });
    }
  } catch (e) {
    console.error("CF status GET error:", e);
  }

  return NextResponse.json(
    { error: "No status data available" },
    { status: 404 }
  );
}
