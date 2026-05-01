import { createHash, timingSafeEqual } from "crypto";
import { query } from "@/lib/db";

/**
 * Validate an agent bearer token against the database.
 * Returns the agent_id if valid, null if not.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Parse agent tokens from env var format: "agent1:token1,agent2:token2"
 */
export function parseAgentTokens(): Map<string, string> {
  const raw = process.env.MC_AGENT_TOKENS || "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [agentId, token] = pair.split(":");
    if (agentId && token) {
      map.set(hashToken(token.trim()), agentId.trim());
    }
  }
  return map;
}

function constantTimeEqual(a: string, b: string): boolean {
  const aDigest = createHash("sha256").update(a).digest();
  const bDigest = createHash("sha256").update(b).digest();
  return timingSafeEqual(aDigest, bDigest);
}

/**
 * Validate bearer token from request header.
 * Returns agent_id if valid, null otherwise.
 */
export function validateToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const tokenMap = parseAgentTokens();
  const hash = hashToken(token);
  return tokenMap.get(hash) || null;
}

export async function validateAgentToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const hash = hashToken(token);

  try {
    const result = await query("SELECT id FROM agents WHERE token_hash = $1 LIMIT 1", [hash]);
    if (result.rows.length > 0) {
      return (result.rows[0] as { id: string }).id;
    }
  } catch {
    // Fall back to bootstrap env tokens below.
  }

  const raw = process.env.MC_AGENT_TOKENS || "";
  for (const pair of raw.split(",")) {
    const [agentId, bootstrapToken] = pair.split(":");
    if (agentId && bootstrapToken && constantTimeEqual(token, bootstrapToken.trim())) {
      return agentId.trim();
    }
  }

  return null;
}
