import { timingSafeEqual, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { UserRole } from "@/lib/rbac";

// Role hierarchy: owner > admin > operator > agent > viewer
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
  // SEC-4: Only accept tokens via Authorization header or httpOnly cookie.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (bearer) return bearer;
  const cookie = req.cookies.get("mc_auth")?.value;
  if (cookie) return cookie;
  return null;
}

/**
 * Resolves the role for the incoming request.
 * Priority: user session → owner token → per-agent DB token → legacy agent tokens
 * Returns null if no valid auth found.
 */
export async function resolveRole(req: NextRequest): Promise<Role | null> {
  const token = extractToken(req);
  if (!token) return null;

  // 1. Check user sessions table (email/password login)
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
      // Map UserRole to Role (operator maps to admin for legacy compat)
      if (userRole === "tenant_user") return "viewer";
      return userRole as Role;
    }
  } catch {
    // user_sessions table may not exist yet during migration — fall through
  }

  // 2. Owner token (MC_ADMIN_TOKEN)
  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";
  if (adminToken && constantTimeEqual(token, adminToken)) return "owner";

  // 3. Per-agent DB token lookup
  try {
    const hash = createHash("sha256").update(token).digest("hex");
    const result = await query(
      "SELECT role FROM agents WHERE token_hash = $1 LIMIT 1",
      [hash]
    );
    const rows = result.rows as Array<{ role: Role }>;
    if (rows.length > 0) return rows[0].role;
  } catch {
    // DB lookup failed — fall through
  }

  // 4. Legacy agent token env var (MC_AGENT_TOKENS)
  const agentTokens = process.env.MC_AGENT_TOKENS ?? "";
  for (const pair of agentTokens.split(",")) {
    const [, t] = pair.split(":");
    if (t && constantTimeEqual(token, t.trim())) return "agent";
  }

  return null;
}

/**
 * Resolve user info from session token (for audit logging).
 * Returns null if not a user session.
 */
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

/**
 * Validate that request has at least the required role.
 */
export async function validateRole(req: NextRequest, required: Role): Promise<Role | null> {
  const role = await resolveRole(req);
  if (!role) return null;
  if (!roleAtLeast(role, required)) return null;
  return role;
}

/**
 * Validates owner/admin token (timing-safe).
 */
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
