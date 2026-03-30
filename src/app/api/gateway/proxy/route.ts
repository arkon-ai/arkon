import { NextRequest, NextResponse } from "next/server";
import { resolveRole } from "@/app/api/tools/_utils";

/**
 * Server-side gateway proxy — keeps GATEWAY_TOKEN out of the client bundle.
 * Accepts { url, method, body } and forwards to the OpenClaw gateway.
 * Requires valid mc_auth cookie (any authenticated role).
 */
export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // Only allow known gateway paths
  const allowedPaths = ["/api/system-event", "/hooks/agent"];
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!allowedPaths.some((p) => normalizedPath.startsWith(p))) {
    return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
  }

  try {
    const targetUrl = `${gatewayUrl.replace(/\/$/, "")}${normalizedPath}`;
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
