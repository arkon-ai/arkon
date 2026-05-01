import { createHash, timingSafeEqual } from "crypto";
import { type NextRequest } from "next/server";
import { query } from "@/lib/db";

export type RequestCredentialType = "user_session" | "owner_token" | "api_key" | "agent_token";

export interface RequestCredential {
  type: RequestCredentialType;
  role: "owner" | "admin" | "operator" | "agent" | "viewer";
  tenant_id: string | null;
  user_id?: number;
  email?: string;
  api_key_id?: number;
  agent_id?: string;
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a.padEnd(64));
    const bBuf = Buffer.from(b.padEnd(64));
    return timingSafeEqual(aBuf.slice(0, 64), bBuf.slice(0, 64)) && a.length === b.length;
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

export function extractRequestToken(req: NextRequest): string | null {
  return extractBearerToken(req) ?? req.cookies.get("mc_auth")?.value ?? null;
}

export async function resolveRequestCredential(req: NextRequest): Promise<RequestCredential | null> {
  const token = extractRequestToken(req);
  if (!token) return null;

  const tokenHash = hashToken(token);

  try {
    const sessionResult = await query(
      `SELECT u.id, u.email, u.role, u.tenant_id FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash]
    );
    if (sessionResult.rows.length > 0) {
      const row = sessionResult.rows[0] as { id: number; email: string; role: string; tenant_id: string | null };
      return {
        type: "user_session",
        role: row.role === "tenant_user" ? "viewer" : row.role as RequestCredential["role"],
        tenant_id: row.tenant_id,
        user_id: row.id,
        email: row.email,
      };
    }
  } catch {
    // Fall through to other credential types.
  }

  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";
  if (adminToken && constantTimeEqual(token, adminToken)) {
    return { type: "owner_token", role: "owner", tenant_id: "*" };
  }

  if (token.startsWith("ak_live_")) {
    try {
      const keyResult = await query(
        `SELECT id, tenant_id FROM api_keys
         WHERE key_hash = $1 AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [tokenHash]
      );
      if (keyResult.rows.length > 0) {
        const row = keyResult.rows[0] as { id: number; tenant_id: string };
        query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]).catch(() => {});
        return { type: "api_key", role: "agent", tenant_id: row.tenant_id, api_key_id: row.id };
      }
    } catch {
      // Fall through.
    }
  }

  try {
    const agentResult = await query(
      "SELECT id, role, tenant_id FROM agents WHERE token_hash = $1 LIMIT 1",
      [tokenHash]
    );
    if (agentResult.rows.length > 0) {
      const row = agentResult.rows[0] as { id: string; role: RequestCredential["role"]; tenant_id: string | null };
      return { type: "agent_token", role: row.role, tenant_id: row.tenant_id, agent_id: row.id };
    }
  } catch {
    // Fall through.
  }

  const agentTokens = process.env.MC_AGENT_TOKENS ?? "";
  for (const pair of agentTokens.split(",")) {
    const [agentId, legacyToken] = pair.split(":");
    if (agentId && legacyToken && constantTimeEqual(token, legacyToken.trim())) {
      return { type: "agent_token", role: "agent", tenant_id: null, agent_id: agentId.trim() };
    }
  }

  return null;
}

export function isNonBrowserCredential(credential: RequestCredential): boolean {
  return credential.type === "owner_token" || credential.type === "api_key" || credential.type === "agent_token";
}
