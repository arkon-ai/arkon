import { NextRequest, NextResponse } from "next/server";
import { resolveRole } from "@/app/api/tools/_utils";

/**
 * Server-side gateway proxy — keeps GATEWAY_TOKEN out of the client bundle.
 * Accepts { url, method, body } and forwards to the OpenClaw gateway.
 * Owner-only (ARKON-01 / WI-1699): forwards allowlisted gateway paths with the
 * server's GATEWAY_TOKEN, so any lower role would amplify to gateway access.
 */
export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const gatewayUrl = process.env.GATEWAY_URL ?? "";
  const gatewayToken = process.env.GATEWAY_TOKEN ?? "";

  if (!gatewayUrl || !gatewayToken) {
    return NextResponse.json({ error: "Gateway not configured" }, { status: 503 });
  }

  let payload: { path?: string; method?: string; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { path, method = "POST", body } = payload;
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // Only allow known gateway paths. Validate the pathname that fetch will ACTUALLY
  // request — parse the full target URL and check its normalized `.pathname` —
  // rather than string-matching the raw input. The WHATWG URL parser decodes+collapses
  // `..` and its percent-encoded forms (`%2e%2e`, `.%2e`, …), so any raw-string guess
  // misses a variant (this is why the literal-`..` check alone was insufficient).
  // Concatenating onto the gateway base (with the path forced to a leading `/`) also
  // keeps a `path` like "http://evil/x" on the gateway origin. Match an exact
  // allowlisted path or a true path-segment child — never a bare startsWith (which
  // passes /api/system-event-backdoor). This allowlist is the load-bearing control on
  // which gateway APIs receive the server GATEWAY_TOKEN.
  const allowedPaths = ["/api/system-event", "/hooks/agent"];
  const rawPath = path.startsWith("/") ? path : `/${path}`;
  let targetUrl: URL;
  try {
    targetUrl = new URL(`${gatewayUrl.replace(/\/$/, "")}${rawPath}`);
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const resolvedPath = targetUrl.pathname;
  const isAllowed = allowedPaths.some(
    (p) => resolvedPath === p || resolvedPath.startsWith(`${p}/`),
  );
  if (!isAllowed) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(targetUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gatewayToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });

    const responseText = await res.text();
    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return NextResponse.json(
      { ok: res.ok, status: res.status, data: responseData },
      { status: res.ok ? 200 : res.status },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gateway request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
