/**
 * Persistent rate limiter backed by TimescaleDB.
 * Falls back to in-memory if DB is unavailable.
 * 100 requests per minute per key.
 */

import { query } from "@/lib/db";

const MAX_REQUESTS = 100;
const WINDOW_MS = 60_000; // 1 minute

// In-memory fallback
const memoryWindows = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    return await checkRateLimitDB(key);
  } catch {
    // DB unavailable — fall back to in-memory
    return checkRateLimitMemory(key);
  }
}

async function checkRateLimitDB(key: string): Promise<{ allowed: boolean; remaining: number }> {
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

  // Upsert: increment counter for this window
  const result = await query(
    `INSERT INTO rate_limit_windows (key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start)
     DO UPDATE SET count = rate_limit_windows.count + 1
     RETURNING count`,
    [key, windowStart.toISOString()]
  );

  const count = (result.rows[0] as { count: number }).count;

  if (count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: MAX_REQUESTS - count };
}

function checkRateLimitMemory(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = memoryWindows.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    memoryWindows.set(key, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}
