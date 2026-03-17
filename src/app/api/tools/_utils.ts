import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Role hierarchy: owner > admin > agent > viewer
export type Role = "owner" | "admin" | "agent" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  agent: 2,
  viewer: 1,
};

export function roleAtLeast(actual: Role, required: Role): boolean {
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
  // Query parameter auth removed — tokens in URLs leak via logs, Referer headers, and browser history.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (bearer) return bearer;
  const cookie = req.cookies.get("mc_auth")?.value;
  if (cookie) return cookie;
  return null;
}

/**
 * Resolves the role for the incoming request.
 * - Owner token (MC_ADMIN_TOKEN) -> 'owner'
 * - Agent token (MC_AGENT_TOKENS env) -> 'agent'
 * - Per-agent DB token -> role from agents.role column
 * Returns null if no valid token found.
 */
export async function resolveRole(req: NextRequest): Promise<Role | null> {
  const token = extractToken(req);
  if (!token) return null;

  // Owner token
  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";
  if (adminToken && constantTimeEqual(token, adminToken)) return "owner";

  // Per-agent DB token lookup (admin/viewer roles)
  try {
    const { createHash } = await import("crypto");
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

  // Legacy agent token env var (MC_AGENT_TOKENS)
  const agentTokens = process.env.MC_AGENT_TOKENS ?? "";
  for (const pair of agentTokens.split(",")) {
    const [, t] = pair.split(":");
    if (t && constantTimeEqual(token, t.trim())) return "agent";
  }

  return null;
}

/**
 * Validate that request has at least the required role.
 * Returns the resolved role, or null if unauthorized.
 */
export async function validateRole(req: NextRequest, required: Role): Promise<Role | null> {
  const role = await resolveRole(req);
  if (!role) return null;
  if (!roleAtLeast(role, required)) return null;
  return role;
}

/**
 * Validates owner/admin token (timing-safe).
 * Checks MC_ADMIN_TOKEN via Authorization header or httpOnly cookie.
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
