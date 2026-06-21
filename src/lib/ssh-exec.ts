import { execFile } from "child_process";
import { isIP } from "net";

/**
 * Safe SSH execution helpers (WI-1347 finding #4).
 *
 * The infra routes previously built `ssh user@ip '<cmd>'` strings and ran them
 * through a LOCAL shell (`exec`) with `ip` / `ssh_user` / `openclaw_user` taken
 * raw from the `infra_nodes` table. That is a stored / second-order command
 * injection primitive. These helpers (a) validate every host/user/port at the
 * exec boundary and (b) run SSH via `execFile` so no local shell is involved —
 * the remote command is passed as a single argv element and reaches only the
 * remote shell, exactly as intended.
 */

const UNIX_USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

/** True for a syntactically valid IPv4/IPv6 literal (no shell metacharacters possible). */
export function isValidIp(value: unknown): value is string {
  return typeof value === "string" && isIP(value) !== 0;
}

/** True for a POSIX-style user name (lowercase, starts with letter/underscore). */
export function isValidUnixUser(value: unknown): value is string {
  return typeof value === "string" && UNIX_USER_RE.test(value);
}

/** True for a TCP port in the valid range. */
export function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535;
}

export interface SshRunResult {
  stdout: string;
  error?: string;
}

export interface SshRunOptions {
  user: string;
  host: string;
  /** Remote command — passed verbatim as ONE argv element to the remote shell (no local shell). */
  command: string;
  keyPath?: string;
  timeoutMs?: number;
}

/**
 * Run `command` on `host` as `user` over SSH without a local shell.
 *
 * Fails closed: returns an error (never spawns) when host/user fail validation,
 * so a tampered or malformed `infra_nodes` row cannot reach the exec boundary.
 */
export function sshRun(opts: SshRunOptions): Promise<SshRunResult> {
  const { user, host, command, keyPath, timeoutMs = 15000 } = opts;

  if (!isValidUnixUser(user)) {
    return Promise.resolve({ stdout: "", error: `Invalid ssh user: ${String(user)}` });
  }
  if (!isValidIp(host)) {
    return Promise.resolve({ stdout: "", error: `Invalid ssh host: ${String(host)}` });
  }

  const args = [
    ...(keyPath ? ["-i", keyPath] : []),
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes",
    `${user}@${host}`,
    command,
  ];

  return new Promise((resolve) => {
    execFile("ssh", args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      const out = (stdout ?? "").toString().trim();
      const errStr = (stderr ?? "").toString().trim();
      if (err) {
        resolve({ stdout: "", error: errStr || err.message });
      } else {
        resolve({ stdout: out, error: errStr || undefined });
      }
    });
  });
}
