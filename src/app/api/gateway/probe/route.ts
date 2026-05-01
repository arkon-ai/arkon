import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { lookup } from "dns/promises";
import net from "net";
import { FRAMEWORK_CONFIGS } from "@/lib/gateway/framework-configs";
import { forbidden, resolveRole } from "@/app/api/tools/_utils";

/**
 * Multi-framework gateway probe.
 *
 * POST /api/gateway/probe
 * Body: { host, port, framework, token?, tlsFingerprint?, discover?, testSsh?, sshHost?, sshUser?, sshKey? }
 *
 * Returns: { reachable, version?, agents?, paired?, error?, sshOk?, sshMessage?, sshError? }
 */

function sshExec(host: string, user: string, command: string, keyPath?: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-o", "BatchMode=yes",
      "-o", `ConnectTimeout=${Math.ceil(timeoutMs / 2000)}`,
      "-o", "StrictHostKeyChecking=accept-new",
    ];
    if (keyPath) {
      args.push("-i", keyPath);
    }
    args.push(`${user}@${host}`, command);

    execFile("ssh", args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve(stdout);
    });
  });
}

interface ProbeBody {
  host?: string;
  port?: number;
  framework?: string;
  token?: string;
  tlsFingerprint?: string;
  discover?: boolean;
  testSsh?: boolean;
  sshHost?: string;
  sshUser?: string;
  sshKey?: string;
}

function getGatewayAllowlist(): Set<string> {
  return new Set(
    (process.env.MC_GATEWAY_PROBE_ALLOWLIST ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAllowlistedTarget(host: string, port: number): boolean {
  const normalizedHost = host.toLowerCase();
  const allowlist = getGatewayAllowlist();
  return allowlist.has(normalizedHost) || allowlist.has(`${normalizedHost}:${port}`);
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("ff")
    );
  }

  return true;
}

function isValidHostInput(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host.includes("/") || host.includes("\\") || host.includes("@")) return false;
  if (net.isIP(host)) return true;
  return /^[a-z0-9.-]+$|^\[[a-f0-9:]+\]$/i.test(host);
}

async function validateProbeTarget(host: string, port: number): Promise<string | null> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return "Invalid port";
  const normalizedHost = host.replace(/^\[|\]$/g, "").trim().toLowerCase();
  if (!isValidHostInput(normalizedHost)) return "Invalid host";
  if (isAllowlistedTarget(normalizedHost, port)) return null;

  if (net.isIP(normalizedHost)) {
    return isBlockedIp(normalizedHost) ? "Gateway target is not allowed" : null;
  }

  try {
    const addresses = await lookup(normalizedHost, { all: true, verbatim: false });
    if (addresses.some((address) => isBlockedIp(address.address))) {
      return "Gateway target resolves to a blocked network";
    }
  } catch {
    return "Gateway target could not be resolved";
  }

  return null;
}

export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (role !== "owner" && role !== "admin") return forbidden("Admin access required");

  let body: ProbeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    host, port, framework = "custom", token, discover,
    testSsh, sshHost, sshUser, sshKey,
  } = body;

  // SSH test mode
  if (testSsh) {
    if (!sshHost || !sshUser) {
      return NextResponse.json({ sshOk: false, sshError: "SSH host and user are required" });
    }
    const targetError = await validateProbeTarget(sshHost, 22);
    if (targetError) {
      console.warn("[gateway/probe] blocked ssh probe", { host: sshHost, reason: targetError });
      return NextResponse.json({ sshOk: false, sshError: targetError }, { status: 400 });
    }
    try {
      const output = await sshExec(sshHost, sshUser, "echo ok && whoami", sshKey || undefined);
      return NextResponse.json({
        sshOk: output.includes("ok"),
        sshMessage: `Connected as ${output.split("\n").filter(Boolean).pop()?.trim() ?? sshUser}`,
      });
    } catch (err) {
      return NextResponse.json({
        sshOk: false,
        sshError: err instanceof Error ? err.message : "SSH connection failed",
      });
    }
  }

  // Gateway probe mode
  if (!host || !port) {
    return NextResponse.json({ reachable: false, error: "Host and port are required" });
  }

  const targetError = await validateProbeTarget(host, port);
  if (targetError) {
    console.warn("[gateway/probe] blocked gateway probe", { host, port, framework, reason: targetError });
    return NextResponse.json({ reachable: false, error: targetError }, { status: 400 });
  }
  console.info("[gateway/probe] gateway probe attempt", { host, port, framework, role });

  const config = FRAMEWORK_CONFIGS[framework];

  // OpenCLAW: use WS-RPC via SSH (existing pattern)
  if (framework === "openclaw") {
    return probeOpenClaw(host, port, token, discover);
  }

  // REST-based frameworks: HTTP health check
  if (config?.protocol === "rest" || config?.protocol === "websocket") {
    return probeRest(host, port, framework, token, discover);
  }

  // Fallback: TCP-level check via HTTP
  return probeRest(host, port, framework, token, discover);
}

async function probeOpenClaw(
  host: string, port: number, token?: string, discover?: boolean,
): Promise<NextResponse> {
  // Try direct HTTP health check first
  const protocol = port === 443 ? "https" : "http";
  const healthUrl = `${protocol}://${host}:${port}/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(healthUrl, {
      signal: controller.signal,
      headers,
      redirect: "manual",
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const result: Record<string, unknown> = {
        reachable: true,
        version: data.version ?? data.gateway_version ?? `OpenCLAW on :${port}`,
        paired: !!data.paired,
      };

      // Discover agents if requested
      if (discover) {
        try {
          const agentsUrl = `${protocol}://${host}:${port}/api/agents`;
          const agentsRes = await fetch(agentsUrl, { headers, redirect: "manual" });
          if (agentsRes.ok) {
            const agentsData = await agentsRes.json();
            result.agents = agentsData.agents ?? agentsData ?? [];
          } else {
            result.agents = [];
          }
        } catch {
          result.agents = [];
        }
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({
      reachable: false,
      error: `Gateway returned HTTP ${res.status}`,
    });
  } catch (err) {
    // Try SSH-based probe as fallback
    const sshHost = process.env.GATEWAY_SSH_HOST;
    const sshUser = process.env.GATEWAY_SSH_USER ?? "brynn";

    if (sshHost) {
      try {
        const output = await sshExec(sshHost, sshUser, "openclaw gateway call system.health --json");
        const data = JSON.parse(output);
        const result: Record<string, unknown> = {
          reachable: true,
          version: data.version ?? "OpenCLAW (via SSH)",
        };

        if (discover) {
          try {
            const agentOutput = await sshExec(sshHost, sshUser, "openclaw gateway call agents.list --json");
            const agentData = JSON.parse(agentOutput);
            result.agents = (agentData.agents ?? []).map((a: Record<string, unknown>) => ({
              id: a.id ?? a.key,
              name: a.name ?? a.displayName ?? a.key,
              isDefault: !!a.isDefault,
              sessionCount: a.sessionCount ?? 0,
            }));
          } catch {
            result.agents = [];
          }
        }

        return NextResponse.json(result);
      } catch {
        // SSH also failed
      }
    }

    return NextResponse.json({
      reachable: false,
      error: err instanceof Error
        ? err.message.includes("abort")
          ? "Connection timed out"
          : err.message
        : "Connection failed",
    });
  }
}

async function probeRest(
  host: string, port: number, framework: string, token?: string, discover?: boolean,
): Promise<NextResponse> {
  const config = FRAMEWORK_CONFIGS[framework];
  const protocol = port === 443 ? "https" : "http";

  // Build health check URL based on framework
  const healthPaths: Record<string, string> = {
    paperclip: "/api/health",
    langgraph: "/ok",
    n8n: "/api/v1/workflows",
    dify: "/v1/parameters",
    openhands: "/api/options/config",
    haystack: "/status",
    flowise: "/api/v1/flows",
    autogen: "/api/health",
    custom: "/health",
  };

  const healthPath = healthPaths[framework] ?? "/health";
  const url = `${protocol}://${host}:${port}${healthPath}`;

  const headers: Record<string, string> = { "Accept": "application/json" };
  if (token) {
    const authType = config?.authType ?? "bearer";
    if (authType === "api-key") {
      headers["X-API-Key"] = token;
      // n8n uses X-N8N-API-KEY
      if (framework === "n8n") headers["X-N8N-API-KEY"] = token;
    } else {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal, headers, redirect: "manual" });
    clearTimeout(timeout);

    if (res.ok || res.status === 401) {
      // 401 means reachable but auth needed
      if (res.status === 401) {
        return NextResponse.json({
          reachable: true,
          version: `${config?.label ?? framework} (auth required)`,
          agents: [],
          error: "Authentication required — check your token",
        });
      }

      const data = await res.json().catch(() => ({}));
      const result: Record<string, unknown> = {
        reachable: true,
        version: data.version ?? `${config?.label ?? framework} on :${port}`,
      };

      // Discover agents based on framework
      if (discover) {
        result.agents = await discoverAgents(protocol, host, port, framework, headers);
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({
      reachable: false,
      error: `Server returned HTTP ${res.status}`,
    });
  } catch (err) {
    return NextResponse.json({
      reachable: false,
      error: err instanceof Error
        ? err.message.includes("abort")
          ? "Connection timed out"
          : err.message
        : "Connection failed",
    });
  }
}

async function discoverAgents(
  protocol: string, host: string, port: number, framework: string, headers: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const agentPaths: Record<string, string> = {
    paperclip: "/api/agents",
    langgraph: "/assistants/search",
    n8n: "/api/v1/workflows",
    dify: "/v1/apps",
    openhands: "/api/conversations",
    haystack: "/status/pipelines",
    flowise: "/api/v1/chatflows",
    autogen: "/api/teams",
  };

  const path = agentPaths[framework];
  if (!path) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `${protocol}://${host}:${port}${path}`;

    // LangGraph uses POST for search
    const method = framework === "langgraph" ? "POST" : "GET";
    const body = framework === "langgraph" ? JSON.stringify({ limit: 50 }) : undefined;
    const reqHeaders = { ...headers };
    if (body) reqHeaders["Content-Type"] = "application/json";

    const res = await fetch(url, { signal: controller.signal, headers: reqHeaders, method, body, redirect: "manual" });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();

    // Normalize per framework
    const items = Array.isArray(data)
      ? data
      : data.agents ?? data.workflows ?? data.data ?? data.apps ?? data.chatflows ?? data.teams ?? data.pipelines ?? [];

    return items.slice(0, 50).map((item: Record<string, unknown>) => ({
      id: item.id ?? item.assistant_id ?? item.key ?? item.name,
      name: item.name ?? item.displayName ?? item.title ?? item.id ?? "Unknown",
      isDefault: !!item.isDefault,
      sessionCount: Number(item.sessionCount ?? item.sessions ?? item.active ?? 0),
    }));
  } catch {
    return [];
  }
}

