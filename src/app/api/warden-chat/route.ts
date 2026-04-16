/**
 * /api/warden-chat — thin proxy to the warden-chat-bridge on HOFMI-TEAM-1.
 *
 * Architecture (Path 3, per v2 plan): this route does NOT invoke any LLM SDK.
 * Instead, it forwards the chat request over Tailscale TCP to
 * warden-chat-bridge.service running as the `warden` OS user on HOFMI-TEAM-1,
 * which runs @anthropic-ai/claude-agent-sdk against warden's OAuth credentials.
 * That's the agent that holds tool access, subagent spawning, file ops — i.e.
 * the real Warden, not a fresh stateless Claude.
 *
 * Wire protocol (bridge ↔ this route): line-delimited JSON.
 *   Request line: { sessionId?, message, model?, actor, tenantId, forceComplex? }
 *   Response lines (one per line):
 *     { type: "session",     data: { sessionId, title, isNew } }
 *     { type: "delta",       data: { text } }
 *     { type: "tool-use",    data: { toolName, input } }
 *     { type: "tool-result", data: { toolName, isError, preview } }
 *     { type: "usage",       data: { model, inputTokens, outputTokens, ... } }
 *     { type: "done",        data: { messageId, fullText } }
 *     { type: "error",       data: { message } }
 *
 * Public contract (browser client): text/event-stream SSE matching the contract
 * the existing warden-chat.tsx React component speaks. We translate bridge
 * JSON lines → SSE events 1:1.
 *
 * Auth: reuses `authorizeJournalActor`. Only governors (warden, brynn) may
 * invoke /warden-chat. Non-governor agents get 403.
 *
 * Config:
 *   WARDEN_BRIDGE_HOST  — default 100.120.252.69 (HOFMI-TEAM-1 Tailscale IP)
 *   WARDEN_BRIDGE_PORT  — default 4723
 *   WARDEN_BRIDGE_TIMEOUT_MS — connect timeout, default 10000
 */
import { NextRequest, NextResponse } from "next/server";
import net from "node:net";
import { authorizeJournalActor } from "@/lib/journal-auth";
import { resolveUser } from "@/app/api/tools/_utils";
import { guardBody } from "@/lib/exfil-guard";
import { classify } from "@/lib/message-classifier";

const BRIDGE_HOST = process.env.WARDEN_BRIDGE_HOST || "100.120.252.69";
const BRIDGE_PORT = parseInt(process.env.WARDEN_BRIDGE_PORT || "4723", 10);
const BRIDGE_CONNECT_TIMEOUT_MS = parseInt(
  process.env.WARDEN_BRIDGE_TIMEOUT_MS || "10000",
  10,
);

// Roles in the `users` table that are governor-equivalent for chat purposes.
// `owner` = Brynn; `admin` = any workspace admin. Everyone else is rejected.
const GOVERNOR_USER_ROLES = new Set(["owner", "admin"]);

interface ChatActor {
  slug: string;       // agent_identities slug — 'warden' or 'brynn'
  tenantId: string;
  role: "governor";
  source: "agent-token" | "user-session";
}

/**
 * Resolve a chat actor from either an agent token (Bearer) or a user session
 * cookie (`mc_auth`). Governors only. Non-governor callers return null.
 */
async function resolveChatActor(req: NextRequest): Promise<ChatActor | null> {
  // Path A: agent token via Authorization: Bearer <agent-token>
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (bearer) {
    const actor = await authorizeJournalActor(authHeader);
    if (actor) {
      if (actor.role !== "governor") return null;
      return {
        slug: actor.slug,
        tenantId: actor.tenantId,
        role: "governor",
        source: "agent-token",
      };
    }
    // Bearer present but not a valid agent token — fall through to user-session
    // resolution, since resolveUser() also reads Bearer as a user session token.
  }

  // Path B: user session via mc_auth cookie (or Bearer-matching user_sessions row)
  const user = await resolveUser(req);
  if (!user) return null;
  if (!GOVERNOR_USER_ROLES.has(user.role)) return null;

  // Tenant comes from mc_tenant cookie (set at login). Owners have user.tenant_id=NULL
  // but the cookie carries whichever tenant they're currently operating in.
  const tenantId = req.cookies.get("mc_tenant")?.value || user.tenant_id;
  if (!tenantId) return null;

  // Map user → agent slug. Brynn the human is always 'brynn' in agent_identities.
  // Future: generalise via a users.agent_slug column or email → slug table.
  const slug = user.email === "brynn@arkonhq.com" ? "brynn" : "brynn";

  return { slug, tenantId, role: "governor", source: "user-session" };
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const actor = await resolveChatActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const forceComplex = body.forceComplex === true;

  // Exfil-guard inbound (log only, never blocks)
  try {
    guardBody(message, {
      direction: "inbound",
      mode: "log",
      agentSlug: actor.slug,
      tenantId: actor.tenantId,
      context: "warden-chat.inbound",
    });
  } catch {
    /* guard failures never block */
  }

  const cls = classify(message, { forceComplex });
  const model = cls.recommendedModel;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const socket = new net.Socket();
      let buffer = "";
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try { socket.destroy(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* ignore */ }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          closed = true;
        }
      };

      socket.setTimeout(BRIDGE_CONNECT_TIMEOUT_MS);

      socket.on("connect", () => {
        socket.setTimeout(0);
        const req = {
          sessionId,
          message,
          model,
          actor: actor.slug,
          tenantId: actor.tenantId,
          forceComplex,
        };
        socket.write(JSON.stringify(req) + "\n");
      });

      socket.on("timeout", () => {
        send("error", { message: `bridge connect timeout after ${BRIDGE_CONNECT_TIMEOUT_MS}ms` });
        close();
      });

      socket.on("error", (err) => {
        send("error", { message: `bridge connection error: ${err.message}` });
        close();
      });

      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          let parsed: { type: string; data: unknown };
          try {
            parsed = JSON.parse(line);
          } catch {
            send("error", { message: `bridge sent invalid JSON: ${line.slice(0, 80)}` });
            continue;
          }

          switch (parsed.type) {
            case "session":
            case "delta":
            case "tool-use":
            case "tool-result":
            case "usage":
              send(parsed.type, parsed.data);
              break;
            case "done":
              send("done", parsed.data);
              close();
              break;
            case "error":
              send("error", parsed.data);
              close();
              break;
            default:
              // Unknown event type — forward verbatim so the client at least sees it
              send(parsed.type, parsed.data);
          }
        }
      });

      socket.on("end", () => close());
      socket.on("close", () => close());

      request.signal.addEventListener("abort", () => {
        send("error", { message: "client aborted" });
        close();
      });

      socket.connect(BRIDGE_PORT, BRIDGE_HOST);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
