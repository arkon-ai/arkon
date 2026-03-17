import { createHash } from "crypto";

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
