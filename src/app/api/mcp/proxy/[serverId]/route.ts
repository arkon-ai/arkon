import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createIdleAndHardAbort } from "@/lib/abort-helpers";

/**
 * MCP Gateway Proxy — /api/mcp/proxy/[serverId]
 *
 * POST: Forward JSON-RPC MCP requests to the registered server
 * GET:  SSE proxy for streaming MCP servers
 *
 * Auth: Bearer token (gateway_token per server, or MC_ADMIN_TOKEN)
 * Logging: All traffic logged to mcp_proxy_logs
 */

interface McpServer {
  id: number;
  name: string;
  url: string;
  host: string;
  port: number;
  server_type: string;
  config_json: Record<string, unknown> | null;
  gateway_enabled: boolean;
  gateway_token: string | null;
  tenant_id: string;
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

function validateGatewayAuth(req: NextRequest, server: McpServer): boolean {
  const token = extractToken(req);
  if (!token) return false;

  // Accept MC admin token
  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";
  if (adminToken && token === adminToken) return true;

  // Accept server-specific gateway token
  if (server.gateway_token && token === server.gateway_token) return true;

  return false;
}

function getTargetUrl(server: McpServer): string | null {
  if (server.url) return server.url;
  if (server.host && server.port) return `http://${server.host}:${server.port}`;
  return null;
}

/**
 * Read an integer env var with a fallback. Guards against the bare
 * `parseInt(process.env.X ?? "default", 10)` foot-gun: when X is set to an
 * empty string, the `??` operator does NOT fall through (only undefined/null
 * trigger it), so `parseInt("", 10) === NaN`, and `setTimeout(fn, NaN)` fires
 * immediately — silently aborting every healthy SSE stream.
 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function logProxy(
  serverId: number,
  serverName: string,
  agentId: string | null,
  method: string,
  mcpMethod: string | null,
  requestSize: number,
  responseSize: number,
  status: number,
  durationMs: number,
  error: string | null,
  tenantId: string
) {
  try {
    await query(
      `INSERT INTO mcp_proxy_logs (server_id, server_name, agent_id, method, mcp_method, request_size, response_size, status, duration_ms, error, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [serverId, serverName, agentId, method, mcpMethod, requestSize, responseSize, status, durationMs, error, tenantId]
    );
  } catch (err) {
    console.error("[mcp-proxy] Failed to log:", err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const start = Date.now();
  let mcpMethod: string | null = null;
  let requestBody = "";

  try {
    // Look up server
    const result = await query(
      "SELECT id, name, url, host, port, server_type, config_json, gateway_enabled, gateway_token, tenant_id FROM mcp_servers WHERE id = $1",
      [serverId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }
    const server = result.rows[0] as McpServer;

    if (!server.gateway_enabled) {
      return NextResponse.json({ error: "Gateway not enabled for this server" }, { status: 403 });
    }

    if (!validateGatewayAuth(req, server)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetUrl = getTargetUrl(server);
    if (!targetUrl) {
      return NextResponse.json({ error: "No target URL configured for this server" }, { status: 400 });
    }

    // Read and forward request body
    requestBody = await req.text();
    const requestSize = Buffer.byteLength(requestBody, "utf8");

    // Extract MCP method from JSON-RPC
    try {
      const parsed = JSON.parse(requestBody);
      mcpMethod = parsed.method ?? null;
    } catch {
      // Not JSON — forward as-is
    }

    // Build forwarded headers
    const forwardHeaders: Record<string, string> = {
      "content-type": req.headers.get("content-type") || "application/json",
    };

    // Inject server-specific headers from config
    if (server.config_json && typeof server.config_json === "object") {
      const configHeaders = (server.config_json as Record<string, unknown>).headers;
      if (configHeaders && typeof configHeaders === "object") {
        for (const [k, v] of Object.entries(configHeaders as Record<string, string>)) {
          forwardHeaders[k] = v;
        }
      }
    }

    // Forward to MCP server
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const proxyRes = await fetch(targetUrl, {
        method: "POST",
        headers: forwardHeaders,
        body: requestBody,
        signal: controller.signal,
      });

      const responseBody = await proxyRes.text();
      const responseSize = Buffer.byteLength(responseBody, "utf8");
      const duration = Date.now() - start;

      // Log
      await logProxy(
        server.id, server.name, null, "POST", mcpMethod,
        requestSize, responseSize, proxyRes.status, duration, null, server.tenant_id
      );

      // Return proxied response
      return new NextResponse(responseBody, {
        status: proxyRes.status,
        headers: {
          "content-type": proxyRes.headers.get("content-type") || "application/json",
          "x-mcp-proxy": "mission-control",
          "x-mcp-server": server.name,
          "x-mcp-duration-ms": String(duration),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const duration = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : "Proxy error";

    await logProxy(
      parseInt(serverId) || 0, "", null, "POST", mcpMethod,
      Buffer.byteLength(requestBody, "utf8"), 0, 502, duration, errorMsg, "transformate"
    );

    return NextResponse.json(
      { error: "Gateway proxy error", details: errorMsg },
      { status: 502 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  // Look up server for SSE proxy
  const result = await query(
    "SELECT id, name, url, host, port, server_type, config_json, gateway_enabled, gateway_token, tenant_id FROM mcp_servers WHERE id = $1",
    [serverId]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  }
  const server = result.rows[0] as McpServer;

  if (!server.gateway_enabled) {
    return NextResponse.json({ error: "Gateway not enabled for this server" }, { status: 403 });
  }

  if (!validateGatewayAuth(req, server)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUrl = getTargetUrl(server);
  if (!targetUrl) {
    return NextResponse.json({ error: "No target URL configured" }, { status: 400 });
  }

  // SSE proxy — stream the response
  const start = Date.now();
  const forwardHeaders: Record<string, string> = {
    accept: "text/event-stream",
  };

  if (server.config_json && typeof server.config_json === "object") {
    const configHeaders = (server.config_json as Record<string, unknown>).headers;
    if (configHeaders && typeof configHeaders === "object") {
      for (const [k, v] of Object.entries(configHeaders as Record<string, string>)) {
        forwardHeaders[k] = v;
      }
    }
  }

  // Phase 4b idle/hard split (WI-086). The previous single
  // `AbortSignal.timeout(120000)` cut healthy MCP SSE streams at 2 min flat.
  // Now: 60s idle (reset per chunk) + 30 min hard ceiling.
  const SSE_IDLE_MS = intEnv("MCP_SSE_IDLE_MS", 60_000);
  const SSE_HARD_MS = intEnv("MCP_SSE_HARD_MS", 30 * 60 * 1000);
  const abort = createIdleAndHardAbort({
    idleMs: SSE_IDLE_MS,
    hardMs: SSE_HARD_MS,
    label: `mcp-sse:${server.name}`,
  });

  try {
    const proxyRes = await fetch(targetUrl, {
      headers: forwardHeaders,
      signal: abort.signal,
    });

    if (!proxyRes.body) {
      abort.clear();
      return NextResponse.json({ error: "No response body from MCP server" }, { status: 502 });
    }

    await logProxy(
      server.id, server.name, null, "GET", "sse-connect",
      0, 0, proxyRes.status, Date.now() - start, null, server.tenant_id
    );

    // Pipe upstream → response through a TransformStream that resets the
    // idle timer on every chunk and clears all timers when the stream ends.
    //
    // Two leak-stopper paths are wired:
    //   1. flush() / cancel()  — upstream EOF or downstream cancel propagates
    //                            through the transform.
    //   2. req.signal "abort"  — Next.js App Router canonical disconnect hook
    //                            (also used in /api/dashboard/stream + /api/journal/stream).
    //
    // Without these, the idle + hard timers remain armed up to 30 min after a
    // client disappears — pinning a closure + AbortController per dead client.
    //
    // `cancel` is in the WHATWG Streams spec (Node 18.17+, all modern browsers)
    // but is missing from TypeScript's lib.dom.d.ts Transformer interface as of
    // 5.x — hence the cast. Track: https://github.com/microsoft/TypeScript/issues/55524
    const idleResetStream = new TransformStream<Uint8Array, Uint8Array>(
      {
        transform(chunk, controller) {
          abort.resetIdle();
          controller.enqueue(chunk);
        },
        flush() {
          abort.clear();
        },
        cancel() {
          abort.clear();
        },
      } as Transformer<Uint8Array, Uint8Array>,
    );

    req.signal.addEventListener("abort", () => {
      abort.clear();
    });

    const observed = proxyRes.body.pipeThrough(idleResetStream);

    return new NextResponse(observed, {
      status: proxyRes.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-mcp-proxy": "mission-control",
        "x-mcp-server": server.name,
      },
    });
  } catch (err) {
    abort.clear();
    const errorMsg = err instanceof Error ? err.message : "SSE proxy error";
    await logProxy(
      server.id, server.name, null, "GET", "sse-connect",
      0, 0, 502, Date.now() - start, errorMsg, server.tenant_id
    );
    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }
}
