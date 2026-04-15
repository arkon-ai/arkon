/**
 * Journal auth + RBAC — separate from ingest auth because the journal has
 * different semantics (owner_agent-scoped writes, governor full access).
 *
 * Agent API keys live in env var MC_JOURNAL_AGENT_TOKENS, format:
 *   "warden:<token>,lumina:<token>,sentinel:<token>,scout:<token>,..."
 *
 * Each token grants the bearer authority to act AS that agent slug. The DB
 * table `agent_identities` determines their role (governor | agent).
 */
import { createHash } from "crypto";
import { query } from "@/lib/db";

export type AgentRole = "governor" | "agent";

export interface JournalActor {
  slug: string;
  role: AgentRole;
  tenantId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseJournalTokens(): Map<string, string> {
  const raw = process.env.MC_JOURNAL_AGENT_TOKENS || "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [slug, token] = pair.split(":");
    if (slug && token) {
      map.set(hashToken(token.trim()), slug.trim());
    }
  }
  return map;
}

/**
 * Resolve an Authorization header to the acting agent + their DB-recorded role.
 * Returns null if unauthorised.
 */
export async function authorizeJournalActor(authHeader: string | null): Promise<JournalActor | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const tokenHash = hashToken(match[1].trim());
  const tokenMap = parseJournalTokens();
  const slug = tokenMap.get(tokenHash);
  if (!slug) return null;

  // Lookup role + tenant from DB — single source of truth
  const { rows } = await query(
    `SELECT slug, role, tenant_id FROM agent_identities WHERE slug = $1 AND active = TRUE LIMIT 1`,
    [slug]
  );
  if (rows.length === 0) return null;
  return { slug: rows[0].slug, role: rows[0].role as AgentRole, tenantId: rows[0].tenant_id };
}

/**
 * Check whether actor can write to (or modify) an entry owned by ownerSlug.
 * Governors can always write; agents can only write their own.
 */
export function canWriteEntry(actor: JournalActor, ownerSlug: string): boolean {
  return actor.role === "governor" || actor.slug === ownerSlug;
}

/**
 * Non-governors can only create entries with themselves as owner_agent.
 * Governors can create on behalf of anyone.
 */
export function canCreateAs(actor: JournalActor, requestedOwnerSlug: string): boolean {
  return actor.role === "governor" || actor.slug === requestedOwnerSlug;
}

/**
 * Session-mutation auth — only governors and the session's creator can end/reassign sessions.
 */
export function canMutateSession(actor: JournalActor, sessionCreator: string): boolean {
  return actor.role === "governor" || actor.slug === sessionCreator;
}
