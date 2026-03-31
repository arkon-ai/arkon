import { timingSafeEqual, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { UserRole } from "@/lib/rbac";

export type Role = "owner" | "admin" | "operator" | "agent" | "viewer";

const ROLE_RANK: Record<string, number> = {
  owner: 5,
  admin: 4,
  operator: 3,
  agent: 2,
  viewer: 1,
};

export function roleAtLeast(actual: string, required: string): boolean {
  return (ROLE_RANK[actual] ?? 0) >= (ROLE_RANK[required] ?? 99);
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

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (bearer) return bearer;
  const cookie = req.cookies.get("mc_auth")?.value;
  if (cookie) return cookie;
  return null;
}

export async function resolveRole(req: NextRequest): Promise<Role | null> {
  const token = extractToken(req);
  if (!token) return null;

  // 1. User sessions
  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const sessionResult = await query(
      `SELECT u.role FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash]
    );
    if (sessionResult.rows.length > 0) {
      const userRole = (sessionResult.rows[0] as { role: string }).role;
      if (userRole === "tenant_user") return "viewer";
      return userRole as Role;
    }
  } catch {
    // Fall through
  }

  // 2. Owner token
  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";
  if (adminToken && constantTimeEqual(token, adminToken)) return "owner";

  // 3. API key (ak_live_*)
  if (token.startsWith("ak_live_")) {
    try {
      const keyHash = createHash("sha256").update(token).digest("hex");
      const keyResult = await query(
        `SELECT id, tenant_id, scopes FROM api_keys
         WHERE key_hash = $1 AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [keyHash]
      );
      if (keyResult.rows.length > 0) {
        const keyRow = keyResult.rows[0] as { id: number };
        query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [keyRow.id]).catch(() => {});
        return "agent";
      }
    } catch {
      // Fall through
    }
  }

  // 4. Per-agent DB token
  try {
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await query(
      "SELECT role FROM agents WHERE token_hash = $1 LIMIT 1",
      [hash]
    );
    const rows = result.rows as Array<{ role: Role }>;
    if (rows.length > 0) return rows[0].role;
  } catch {
    // Fall through
  }

  // 5. Legacy agent tokens
  const agentTokens = process.env.MC_AGENT_TOKENS ?? "";
  for (const pair of agentTokens.split(",")) {
    const [, t] = pair.split(":");
    if (t && constantTimeEqual(token, t.trim())) return "agent";
  }

  return null;
}

export async function resolveUser(req: NextRequest): Promise<{ id: number; email: string; role: string; tenant_id: string | null } | null> {
  const token = extractToken(req);
  if (!token) return null;

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await query(
      `SELECT u.id, u.email, u.role, u.tenant_id FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash]
    );
    return result.rows.length > 0 ? result.rows[0] as { id: number; email: string; role: string; tenant_id: string | null } : null;
  } catch {
    return null;
  }
}

export async function resolveApiKey(req: NextRequest): Promise<{ id: number; tenant_id: string; scopes: string[] } | null> {
  const token = extractToken(req);
  if (!token || !token.startsWith("ak_live_")) return null;

  try {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const result = await query(
      `SELECT id, tenant_id, scopes FROM api_keys
       WHERE key_hash = $1 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [keyHash]
    );
    return result.rows.length > 0 ? result.rows[0] as { id: number; tenant_id: string; scopes: string[] } : null;
  } catch {
    return null;
  }
}

export async function validateRole(req: NextRequest, required: Role): Promise<Role | null> {
  const role = await resolveRole(req);
  if (!role) return null;
  if (!roleAtLeast(role, required)) return null;
  return role;
}

export function validateAdmin(req: NextRequest): boolean {
  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";
  if (!adminToken) return false;
  const token = extractToken(req);
  if (!token) return false;
  return constantTimeEqual(token, adminToken);
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function parseJsonRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function parseTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function parseInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
