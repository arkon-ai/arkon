import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { UserRole } from "@/lib/rbac";
import {
  extractRequestToken,
  resolveRequestCredential,
} from "@/lib/request-auth";

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

export async function resolveRole(req: NextRequest): Promise<Role | null> {
  const credential = await resolveRequestCredential(req);
  return credential?.role ?? null;
}

export async function resolveUser(req: NextRequest): Promise<{ id: number; email: string; role: string; tenant_id: string | null } | null> {
  const credential = await resolveRequestCredential(req);
  if (!credential || credential.type !== "user_session" || !credential.user_id) return null;
  return {
    id: credential.user_id,
    email: credential.email ?? "",
    role: credential.role,
    tenant_id: credential.tenant_id,
  };
}

export async function resolveApiKey(req: NextRequest): Promise<{ id: number; tenant_id: string; scopes: string[] } | null> {
  const token = extractRequestToken(req);
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
  const token = extractRequestToken(req);
  if (!token) return false;
  return constantTimeEqual(token, adminToken);
}

export async function isOwnerOrAdmin(req: NextRequest): Promise<boolean> {
  if (validateAdmin(req)) return true;
  const role = await resolveRole(req);
  return role === "owner";
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
