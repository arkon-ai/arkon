import { constantTimeEqual } from "@/lib/auth-utils";

/**
 * THE CRON SECRET CHECK (transformate WI-5647 C2). proxy.ts hands a plain Bearer POST to /api/cron/baseline straight to
 * the route (CRON_ROUTE_PATHS), so any Bearer reaches this compare without the gate in front of it. It compares in
 * constant time (the repo's constantTimeEqual: sha256 of both sides, no length leak) and refuses, before any compare,
 * an unset, empty or whitespace-only CRON_SECRET and a null or empty provided value. It lives beside route.ts because
 * Next accepts only route exports from a route.ts.
 */
export function cronSecretMatches(
  provided: string | null | undefined,
  cronSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!cronSecret || !cronSecret.trim() || !provided) return false;
  return constantTimeEqual(provided, cronSecret);
}
