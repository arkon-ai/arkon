import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../_utils";

const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0";

/* ─── GET — search/list the official MCP registry ───────── */
export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);

    const res = await fetch(`${REGISTRY_BASE}/servers?${params.toString()}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Registry returned ${res.status}`);
    const data = await res.json() as { servers: unknown[]; total?: number; nextCursor?: string };

    // Also get list of already-imported server names for UI comparison
    const existing = await query("SELECT name FROM mcp_servers");
    const existingNames = new Set(existing.rows.map((r: Record<string, unknown>) => (r.name as string).toLowerCase()));

    // Annotate each server with whether it's already imported
    const annotated = (data.servers ?? []).map((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const server = e.server as Record<string, unknown>;
      const serverName = (server?.title as string ?? server?.name as string ?? "").toLowerCase();
      return {
        ...e,
        _imported: existingNames.has(serverName),
      };
    });

    return NextResponse.json({ servers: annotated, total: data.total, nextCursor: data.nextCursor });
  } catch (err) {
    return NextResponse.json({ error: `Registry fetch failed: ${String(err)}` }, { status: 502 });
  }
}

/* ─── POST — import selected servers from registry into MC ─ */
export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const body = await req.json() as { servers: Array<Record<string, unknown>> };
  if (!Array.isArray(body.servers) || body.servers.length === 0) {
    return NextResponse.json({ error: "servers array required" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (const entry of body.servers) {
    const server = entry.server as Record<string, unknown>;
    if (!server) continue;

    const name = (server.title as string) ?? (server.name as string) ?? "Unknown";
    const description = server.description as string ?? null;
    const websiteUrl = server.websiteUrl as string ?? null;

    // Try to extract URL from remotes or packages
    const remotes = server.remotes as Array<Record<string, unknown>> ?? [];
    const packages = server.packages as Array<Record<string, unknown>> ?? [];
    const url = remotes[0]?.url as string ?? websiteUrl ?? null;

    // Parse host/port from url
    let host: string | null = null;
    let port: number | null = null;
    if (url) {
      try {
        const u = new URL(url);
        host = u.hostname;
        port = parseInt(u.port || (u.protocol === "https:" ? "443" : "80"), 10);
      } catch { /* ignore */ }
    }

    // Determine transport type
    const transportType = remotes[0]?.type as string
      ?? packages[0]?.transport
        ? ((packages[0].transport as Record<string, unknown>)?.type as string)
        : "mcp";

    // Check for duplicate
    const existing = await query("SELECT id FROM mcp_servers WHERE LOWER(name) = LOWER($1)", [name]);
    if (existing.rowCount && existing.rowCount > 0) {
      skipped++;
      continue;
    }

    const repoUrl = (server.repository as Record<string, unknown>)?.url as string ?? null;
    const notes = [
      description ? description.slice(0, 300) : null,
      repoUrl ? `Repo: ${repoUrl}` : null,
      `Source: Official MCP Registry`,
    ].filter(Boolean).join(" | ");

    await query(
      `INSERT INTO mcp_servers (name, url, host, port, server_type, approved, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, url, host, port, transportType ?? "mcp", false, notes]
    );
    imported++;
  }

  return NextResponse.json({ ok: true, imported, skipped });
}
