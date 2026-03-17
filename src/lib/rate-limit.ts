/**
 * Simple in-memory rate limiter.
 * 100 requests per minute per agent token.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

const MAX_REQUESTS = 100;
const WINDOW_MS = 60_000; // 1 minute

export function checkRateLimit(agentId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = windows.get(agentId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(agentId, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}
