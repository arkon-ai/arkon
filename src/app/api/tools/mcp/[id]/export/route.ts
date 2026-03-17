import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

/* ─── GET — export MCP config for AI clients ────────────── */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await params;
  const serverId = parseInt(id, 10);
  if (!serverId) return NextResponse.json({ error: "Invalid server id" }, { status: 400 });

  const format = req.nextUrl.searchParams.get("format") ?? "claude-code";

  const result = await query(
    `SELECT id, name, url, host, port, server_type, config_json, notes
     FROM mcp_servers WHERE id = $1`,
    [serverId]
  );

  if (!result.rows[0]) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const server = result.rows[0] as {
    id: number; name: string; url: string | null; host: string | null;
    port: number | null; server_type: string; config_json: Record<string, unknown> | null;
    notes: string | null;
  };

  // If server has custom config_json, use that as base
  const customConfig = server.config_json ?? {};

  let config: Record<string, unknown>;

  switch (format) {
    case "claude-code":
      // Claude Code / Claude Desktop format
      if (server.server_type === "stdio") {
        config = {
          mcpServers: {
            [server.name.toLowerCase().replace(/\s+/g, "-")]: {
              command: (customConfig as Record<string, unknown>).command ?? "npx",
              args: (customConfig as Record<string, unknown>).args ?? [`-y`, `@modelcontextprotocol/server-${server.name.toLowerCase()}`],
              ...(customConfig as Record<string, unknown>).env ? { env: (customConfig as Record<string, unknown>).env } : {},
            },
          },
        };
      } else {
        // SSE / HTTP remote server
        config = {
          mcpServers: {
            [server.name.toLowerCase().replace(/\s+/g, "-")]: {
              url: server.url ?? `http://${server.host}:${server.port}`,
              ...(customConfig as Record<string, unknown>).headers ? { headers: (customConfig as Record<string, unknown>).headers } : {},
            },
          },
        };
      }
      break;

    case "cursor":
      // Cursor format (similar but uses different key structure)
      if (server.server_type === "stdio") {
        config = {
          mcpServers: {
            [server.name.toLowerCase().replace(/\s+/g, "-")]: {
              command: (customConfig as Record<string, unknown>).command ?? "npx",
              args: (customConfig as Record<string, unknown>).args ?? [`-y`, `@modelcontextprotocol/server-${server.name.toLowerCase()}`],
            },
          },
        };
      } else {
        config = {
          mcpServers: {
            [server.name.toLowerCase().replace(/\s+/g, "-")]: {
              url: server.url ?? `http://${server.host}:${server.port}`,
            },
          },
        };
      }
      break;

    case "raw":
      config = {
        id: server.id,
        name: server.name,
        url: server.url,
        host: server.host,
        port: server.port,
        server_type: server.server_type,
        config: customConfig,
      };
      break;

    default:
      return NextResponse.json({ error: "Unknown format. Use: claude-code, cursor, raw" }, { status: 400 });
  }

  return NextResponse.json({
    format,
    server_name: server.name,
    config,
    instructions: format === "claude-code"
      ? "Add this to your claude_desktop_config.json or .claude/settings.json"
      : format === "cursor"
      ? "Add this to your .cursor/mcp.json"
      : "Raw server configuration",
  });
}
