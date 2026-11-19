import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateOwner, unauthorized } from "@/app/api/tools/_utils";

/**
 * GET /api/mcp/gateway/config
 * Generates MCP client configs that route through MC's gateway proxy.
 * Query: ?format=claude-code|cursor|raw&servers=1,2,3 (optional, defaults to all gateway-enabled)
 */
export async function GET(req: NextRequest) {
  if (!(await validateOwner(req))) return unauthorized();

  const format = req.nextUrl.searchParams.get("format") || "claude-code";
  const serverIds = req.nextUrl.searchParams.get("servers")?.split(",").map(Number).filter(Boolean);

  try {
    let serversResult;
    if (serverIds && serverIds.length > 0) {
      const placeholders = serverIds.map((_, i) => `$${i + 1}`).join(",");
      serversResult = await query(
        `SELECT id, name, url, host, port, server_type, gateway_enabled, gateway_token
         FROM mcp_servers WHERE id IN (${placeholders}) AND gateway_enabled = true`,
        serverIds
      );
    } else {
      serversResult = await query(
        "SELECT id, name, url, host, port, server_type, gateway_enabled, gateway_token FROM mcp_servers WHERE gateway_enabled = true"
      );
    }

    const servers = serversResult.rows as Array<{
      id: number; name: string; url: string; host: string; port: number;
      server_type: string; gateway_enabled: boolean; gateway_token: string | null;
    }>;

    const gatewayBase = process.env.MC_GATEWAY_URL || process.env.ARKON_BASE_URL || "http://localhost:3000";

    if (format === "claude-code" || format === "cursor") {
      const mcpServers: Record<string, Record<string, unknown>> = {};

      for (const server of servers) {
        const slug = server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
        const proxyUrl = `${gatewayBase}/api/mcp/proxy/${server.id}`;

        mcpServers[slug] = server.gateway_token
          ? { url: proxyUrl, headers: { Authorization: `Bearer ${server.gateway_token}` } }
          : { url: proxyUrl, note: NO_GATEWAY_TOKEN_NOTE };
      }

      return NextResponse.json({
        format,
        gateway: gatewayBase,
        servers_count: servers.length,
        config: { mcpServers },
        instructions: format === "claude-code"
          ? "Add the mcpServers block to your claude_desktop_config.json or .claude/settings.json. All MCP traffic will be proxied through Arkon for logging and auth."
          : "Add the mcpServers block to your Cursor settings. All MCP traffic will be proxied through Arkon.",
      });
    }

    // Raw format
    return NextResponse.json({
      format: "raw",
      gateway: gatewayBase,
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        server_type: s.server_type,
        direct_url: s.url || `http://${s.host}:${s.port}`,
        proxy_url: `${gatewayBase}/api/mcp/proxy/${s.id}`,
        gateway_enabled: s.gateway_enabled,
        ...(s.gateway_token ? {} : { note: NO_GATEWAY_TOKEN_NOTE }),
      })),
    });
  } catch (err) {
    console.error("[mcp/gateway/config] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Zero byte of the owner key in any export (transformate WI-4496 (f)): a server's own gateway_token is its header; a
// server with none is listed with this note and zero header (deck-main PICK D.U5.2 (a)). Shown words (RECORD 7491):
// they ship only on the owner's approve of the exact text (the Desk words row).
const NO_GATEWAY_TOKEN_NOTE =
  "No gateway token is set for this server, so this entry carries no Authorization header. Set a gateway token for this server, then generate this config again.";
