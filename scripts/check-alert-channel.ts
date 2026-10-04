/**
 * check-alert-channel — read-only check that Arkon's threat and approval
 * alerts have a live external channel (transformate WI-3986).
 *
 * Usage: npx tsx scripts/check-alert-channel.ts
 *
 * Loads Arkon's env with the loader Next uses (@next/env) from the fixed dir
 * /home/brynn/arkon (ARKON_DIR overrides it, for tests only). Resolves the
 * system tenant the alert path uses, reads its enabled notification_preferences
 * rows, and asks each one if it answers:
 *   telegram -> Telegram getChat (bot_token + chat_id)
 *   discord  -> GET webhook_url
 *   slack, webhook and email rows are NOT checked live and read DARK.
 * A live row covers only the alert types it dispatches (config.types; no types =
 * threat_critical, threat_high and approval). Exit 0 and 'live' when every alert
 * type has a live row; else exit 1 and 'DARK' for each uncovered type.
 * Prints names, the tenant id and HTTP statuses only — never a config or env value.
 */

import { loadEnvConfig } from "@next/env";
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

export const DEFAULT_ARKON_DIR = "/home/brynn/arkon";
const ENV_NAMES = ["ARKON_SYSTEM_TENANT_ID", "DATABASE_URL", "ALERT_MIN_LEVEL"];

/** Load .env* from the deployed Arkon dir, never from this checkout (N1). */
export function loadArkonEnv(): string {
  const dir = process.env.ARKON_DIR?.trim() || DEFAULT_ARKON_DIR;
  loadEnvConfig(dir);
  return dir;
}

/** Names only: whether each env key is set in this process. */
export function envPresenceLine(): string {
  return "env " + ENV_NAMES.map((n) => `${n}=${process.env[n] ? "set" : "unset"}`).join(" ");
}

type Row = { channel: string; config: Record<string, unknown> | null };

async function probe(row: Row): Promise<string> {
  const config = row.config ?? {};
  try {
    if (row.channel === "telegram") {
      const token = config.bot_token as string | undefined;
      const chatId = config.chat_id as string | undefined;
      if (!token || !chatId) return "DARK missing keys";
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(String(chatId))}`,
        { signal: AbortSignal.timeout(5000) },
      );
      const body = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      return res.ok && body?.ok === true ? "live" : `DARK API not ok (HTTP ${res.status})`;
    }
    if (row.channel === "discord") {
      const url = config.webhook_url as string | undefined;
      if (!url) return "DARK missing keys";
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok ? "live" : `DARK API not ok (HTTP ${res.status})`;
    }
    return "DARK not checked live";
  } catch (err) {
    // The error name only: a message could carry the request URL (a secret).
    return `DARK request failed (${(err as Error)?.name ?? "error"})`;
  }
}

/** Returns the exit code. */
export async function checkAlertChannel(): Promise<number> {
  console.log(envPresenceLine());
  // Imported after the env load: db.ts reads DATABASE_URL when it is imported.
  const { query } = await import("../src/lib/db");
  const { getSystemTenantId } = await import("../src/lib/notifications");

  const tenantId = await getSystemTenantId();
  console.log(`system tenant: ${tenantId ?? "(none)"}`);
  if (!tenantId) {
    console.log("DARK: no system tenant resolved");
    return 1;
  }

  const { rows } = await query(
    `SELECT channel, config FROM notification_preferences WHERE tenant_id = $1 AND enabled = TRUE`,
    [tenantId],
  );
  if (rows.length === 0) {
    console.log("DARK: no enabled notification_preferences row");
    return 1;
  }

  const live: Row[] = [];
  for (const row of rows as Row[]) {
    const result = await probe(row);
    console.log(`${row.channel}: ${result}`);
    if (result === "live") live.push(row);
  }
  if (live.length === 0) {
    console.log("DARK: no row answered ok");
    return 1;
  }
  // Types-aware (WI-3994): a live row counts only for the alert types it dispatches.
  const { ALERT_PREF_KEYS, rowTakesKey } = await import("../src/lib/notifications");
  let dark = 0;
  for (const key of ALERT_PREF_KEYS) {
    const by = live.filter((r) => rowTakesKey(r.config, key)).map((r) => r.channel);
    if (by.length === 0) dark++;
    console.log(by.length ? `${key}: live (${by.join(", ")})` : `${key}: DARK (no live row covers it)`);
  }
  if (dark > 0) return 1;
  console.log(`live: ${live.map((r) => r.channel).join(", ")}`);
  return 0;
}

async function main() {
  console.log(`env dir: ${loadArkonEnv()}`);
  let code = 1;
  try {
    code = await checkAlertChannel();
  } catch (err) {
    console.log(`DARK: check failed (${(err as Error)?.name ?? "error"})`);
  } finally {
    await (await import("../src/lib/db")).default.end().catch(() => {});
  }
  process.exit(code);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
