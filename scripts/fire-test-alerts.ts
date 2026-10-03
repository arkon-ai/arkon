/**
 * fire-test-alerts — fire one critical threat, one high threat and one urgent
 * approval through the real alert functions (transformate WI-3986, F3).
 *
 * Usage: npx tsx scripts/fire-test-alerts.ts
 *
 * Calls fireAlert / fireApprovalAlert with the call sites' argument shape
 * (src/app/api/ingest/route.ts, src/app/api/tools/approvals/route.ts): NO
 * tenantId, so the alert path resolves the tenant exactly as the server does.
 * Ids are non-existent ('test-wi3986-<n>'); titles carry 'TEST transformate WI-3986'.
 *
 * STOPS (exit 1, nothing fired) when no server-written threat or approval
 * notification row exists, or when its tenant differs from the resolved tenant.
 * A fetch spy prints Telegram ok + message_id (parsed from the response body)
 * and, for any other host, the HTTP status only. Never prints a config or env value.
 */

import { realpathSync } from "fs";
import { fileURLToPath } from "url";
import { envPresenceLine, loadArkonEnv } from "./check-alert-channel";

export const TEST_MARK = "TEST transformate WI-3986";

function installFetchSpy(): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await realFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Never print the URL: it carries the bot token or the webhook secret.
    if (url.startsWith("https://api.telegram.org/")) {
      const body = (await res.clone().json().catch(() => null)) as
        | { ok?: boolean; result?: { message_id?: number } }
        | null;
      console.log(`spy telegram ok=${body?.ok === true} message_id=${body?.result?.message_id ?? "none"}`);
    } else {
      console.log(`spy status=${res.status}`);
    }
    return res;
  };
  return () => {
    globalThis.fetch = realFetch;
  };
}

/** Returns the exit code. */
export async function fireTestAlerts(): Promise<number> {
  console.log(envPresenceLine());
  // Imported after the env load: db.ts reads DATABASE_URL when it is imported.
  const { query } = await import("../src/lib/db");
  const { resolveNotificationTenantId } = await import("../src/lib/notifications");
  const { fireAlert, fireApprovalAlert } = await import("../src/lib/alert-fire");

  const tenantId = await resolveNotificationTenantId("default");
  console.log(`resolved tenant: ${tenantId ?? "(none)"}`);
  if (!tenantId) {
    console.log("STOP: no tenant resolved");
    return 1;
  }

  // Independent tenant check (N3): the newest threat/approval row the server wrote.
  const { rows } = await query(
    `SELECT tenant_id, created_at FROM notifications
     WHERE type IN ('threat', 'approval') AND title NOT LIKE $1
     ORDER BY created_at DESC LIMIT 1`,
    [`%${TEST_MARK}%`],
  );
  const newest = rows[0] as { tenant_id: string; created_at: unknown } | undefined;
  if (!newest) {
    console.log("STOP: no server-written threat or approval notification row; tenant check cannot run");
    return 1;
  }
  console.log(`newest server-written row: tenant=${newest.tenant_id} at ${String(newest.created_at)}`);
  if (newest.tenant_id !== tenantId) {
    console.log("STOP: resolved tenant differs from the server-written row's tenant");
    return 1;
  }

  const restore = installFetchSpy();
  try {
    const createdAt = new Date().toISOString();
    for (const [n, level] of [[1, "critical"], [2, "high"]] as const) {
      console.log(`fire ${n}: fireAlert ${level}`);
      await fireAlert(
        { agentId: `test-wi3986-${n}`, agentName: TEST_MARK, eventType: "test", createdAt },
        { level, classes: ["prompt_injection"], matches: [] },
      );
    }
    console.log("fire 3: fireApprovalAlert urgent");
    await fireApprovalAlert({
      // ponytail: a string id on purpose — no approvals row may match it.
      id: "test-wi3986-3" as unknown as number,
      title: TEST_MARK,
      agentId: "test-wi3986-3",
      priority: "urgent",
      contentPreview: `${TEST_MARK} synthetic approval`,
    });
  } finally {
    restore();
  }
  return 0;
}

async function main() {
  console.log(`env dir: ${loadArkonEnv()}`);
  let code = 1;
  try {
    code = await fireTestAlerts();
  } catch (err) {
    console.log(`STOP: failed (${(err as Error)?.name ?? "error"})`);
  } finally {
    await (await import("../src/lib/db")).default.end().catch(() => {});
  }
  process.exit(code);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
