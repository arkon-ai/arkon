/**
 * exfil-guard — bidirectional middleware for inbound/outbound payloads.
 *
 * Promotes the single-direction `redact.ts` into a symmetric guard that can:
 *   - scan text/headers/JSON for secrets before they leave the process (outbound)
 *   - scan ingested content before it's persisted (inbound)
 *   - record findings to the existing `audit_log` table (best-effort)
 *   - optionally scrub (mode="block") or just log (mode="log", default)
 *
 * NOTE: redact.ts is the source of truth for the inbound scrubbing pipeline
 * (already deployed at src/app/api/ingest/route.ts). We intentionally do NOT
 * import from it; dependency flows one-way (redact.ts -> nothing; guard
 * replicates its patterns plus outbound-specific ones). This keeps redact.ts
 * tiny and avoids a circular risk if route wiring later imports guard.
 */

import { query } from "@/lib/db";

export type GuardDirection = "inbound" | "outbound";

export interface GuardFinding {
  pattern: string;
  count: number;
  preview?: string;
}

export interface GuardResult {
  cleanText: string;
  cleanHeaders: Record<string, string | string[] | undefined>;
  findings: GuardFinding[];
  blocked: boolean;
}

export interface GuardOptions {
  direction: GuardDirection;
  mode?: "log" | "block";
  agentSlug?: string;
  tenantId?: string;
  context?: string;
}

interface PatternDef {
  name: string;
  regex: RegExp;
  severity: "high" | "medium" | "low";
  // If true, this pattern is only meaningful on outbound paths
  outboundOnly?: boolean;
}

/**
 * Union of redact.ts patterns plus outbound-specific heuristics.
 * Keep regex literals local (not imported) so guard is self-contained.
 * All regexes are declared with the `g` flag so `.matchAll` works.
 */
export const DEFAULT_PATTERNS: PatternDef[] = [
  // --- Mirror of redact.ts (SK/xox/gh/AWS/Bearer/DSN/PEM) ---
  { name: "openai-key", regex: /sk-[a-zA-Z0-9_-]{20,}/g, severity: "high" },
  { name: "slack-bot-token", regex: /xoxb-[a-zA-Z0-9_-]+/g, severity: "high" },
  { name: "slack-user-token", regex: /xoxp-[a-zA-Z0-9_-]+/g, severity: "high" },
  { name: "github-pat", regex: /ghp_[a-zA-Z0-9]{36,}/g, severity: "high" },
  { name: "gitlab-pat", regex: /glpat-[a-zA-Z0-9_-]{20,}/g, severity: "high" },
  { name: "bearer-token", regex: /Bearer\s+[a-zA-Z0-9._-]{20,}/g, severity: "high" },
  {
    name: "kv-secret",
    regex:
      /(?:api_key|apikey|api-key|token|secret|password|passwd|pwd)\s*[=:]\s*['"]?[a-zA-Z0-9_./+=-]{8,}['"]?/gi,
    severity: "high",
  },
  { name: "aws-access-key", regex: /AKIA[0-9A-Z]{16}/g, severity: "high" },
  {
    name: "db-dsn",
    regex: /(?:postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@/g,
    severity: "high",
  },
  {
    name: "private-key-pem",
    regex:
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    severity: "high",
  },

  // --- Outbound-specific additions ---
  // High-entropy tokens: 32+ chars of hex or base64url. We require both digits AND
  // letters to cut false positives on pure-text identifiers; and we anchor on
  // word boundaries so diff hashes (SHA-1 40 hex) still match but english prose
  // doesn't. 40-char hex is common (SHA-1, API IDs) — we accept 32+.
  {
    name: "high-entropy-token",
    regex: /\b(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}\b/g,
    severity: "medium",
    outboundOnly: true,
  },
  // Private/internal IPs — meaningful only on outbound (leak of internal topology)
  {
    name: "private-ip",
    regex:
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/g,
    severity: "low",
    outboundOnly: true,
  },
];

// Headers that are stripped (outbound) or audited-but-preserved (inbound).
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

// Protection against pathological inputs
const MAX_SCAN_LENGTH = 1_000_000; // 1MB of text; larger bodies are head-scanned
const MAX_JSON_NODES = 50_000; // ceiling for iterative JSON walk

function makePreview(match: string): string {
  // Deterministic safe preview: first 4 chars + "..." so Sentinel can pattern-match
  // in audit logs without exposing the secret body.
  if (match.length <= 8) return match.slice(0, 4) + "****";
  return match.slice(0, 4) + "...[" + (match.length - 4) + "chars]";
}

function scanText(
  text: string,
  direction: GuardDirection,
): { findings: GuardFinding[]; scrubbed: string; hasHigh: boolean } {
  const findings: GuardFinding[] = [];
  let scrubbed = text;
  let hasHigh = false;

  for (const def of DEFAULT_PATTERNS) {
    if (def.outboundOnly && direction !== "outbound") continue;

    // Reset lastIndex on the shared regex (defensive — `g` flag is stateful)
    def.regex.lastIndex = 0;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = def.regex.exec(text)) !== null) {
      matches.push(m[0]);
      // Guard against zero-width matches causing infinite loops
      if (m.index === def.regex.lastIndex) def.regex.lastIndex++;
    }

    if (matches.length > 0) {
      findings.push({
        pattern: def.name,
        count: matches.length,
        preview: makePreview(matches[0]),
      });
      if (def.severity === "high") hasHigh = true;
    }
  }

  // Scrub after finding so preview captures real match, not [REDACTED:...]
  for (const def of DEFAULT_PATTERNS) {
    if (def.outboundOnly && direction !== "outbound") continue;
    def.regex.lastIndex = 0;
    scrubbed = scrubbed.replace(def.regex, `[REDACTED:${def.name}]`);
  }

  return { findings, scrubbed, hasHigh };
}

function recordAudit(
  findings: GuardFinding[],
  opts: GuardOptions,
  subject: "body" | "headers" | "json",
): void {
  if (findings.length === 0) return;
  // Fire-and-forget; never throw. Schema: existing audit_log (v1) from migration 000.
  // Columns: actor, action, resource_type, resource_id, detail (JSONB), tenant_id.
  try {
    const detail = {
      direction: opts.direction,
      context: opts.context ?? null,
      mode: opts.mode ?? "log",
      subject,
      findings,
    };
    const p = query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, tenant_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        opts.agentSlug ?? "exfil-guard",
        `exfil.${opts.direction}.${opts.mode ?? "log"}`,
        "exfil-finding",
        opts.context ?? null,
        JSON.stringify(detail),
        opts.tenantId ?? "default",
      ],
    );
    // Swallow async rejections; do NOT let audit failures affect the caller.
    if (p && typeof (p as Promise<unknown>).catch === "function") {
      (p as Promise<unknown>).catch(() => {
        /* best-effort */
      });
    }
  } catch {
    /* best-effort */
  }
}

function emptyResult(): GuardResult {
  return { cleanText: "", cleanHeaders: {}, findings: [], blocked: false };
}

export function guardBody(text: string | null | undefined, opts: GuardOptions): GuardResult {
  if (text === null || text === undefined || text === "") return emptyResult();

  const scanned = text.length > MAX_SCAN_LENGTH ? text.slice(0, MAX_SCAN_LENGTH) : text;
  const { findings, scrubbed, hasHigh } = scanText(scanned, opts.direction);

  const mode = opts.mode ?? "log";
  const shouldBlock = mode === "block";
  const cleanText = shouldBlock
    ? scrubbed + (text.length > MAX_SCAN_LENGTH ? text.slice(MAX_SCAN_LENGTH) : "")
    : text;

  if (findings.length > 0) {
    console.warn(
      `[exfil-guard] ${opts.direction}/${mode} ctx=${opts.context ?? "?"} findings=${findings
        .map((f) => `${f.pattern}x${f.count}`)
        .join(",")}`,
    );
    recordAudit(findings, opts, "body");
  }

  return {
    cleanText,
    cleanHeaders: {},
    findings,
    blocked: shouldBlock && hasHigh,
  };
}

export function guardHeaders(
  headers: Record<string, unknown> | null | undefined,
  opts: GuardOptions,
): GuardResult {
  if (!headers) return emptyResult();

  const cleanHeaders: Record<string, string | string[] | undefined> = {};
  const findings: GuardFinding[] = [];
  let hasHigh = false;
  const mode = opts.mode ?? "log";

  for (const [rawKey, rawVal] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    const isSensitive = SENSITIVE_HEADER_NAMES.has(key);
    const asStr = Array.isArray(rawVal)
      ? rawVal.map((v) => String(v)).join(", ")
      : rawVal === undefined || rawVal === null
        ? ""
        : String(rawVal);

    if (isSensitive) {
      findings.push({
        pattern: `sensitive-header:${key}`,
        count: 1,
        preview: asStr ? makePreview(asStr) : undefined,
      });
      hasHigh = true;
      // Outbound: strip by default. Inbound: preserve (the app may need it) but audit.
      if (opts.direction === "outbound" && mode === "block") {
        // drop the header entirely
        continue;
      }
      if (opts.direction === "outbound" && mode === "log") {
        // still preserve (log-only mode)
        cleanHeaders[rawKey] = rawVal as string | string[] | undefined;
        continue;
      }
      // inbound: preserve
      cleanHeaders[rawKey] = rawVal as string | string[] | undefined;
      continue;
    }

    // Scan header *values* for leaked secrets embedded in otherwise-innocent headers.
    if (asStr.length > 0) {
      const { findings: f, scrubbed, hasHigh: h } = scanText(asStr, opts.direction);
      if (f.length > 0) {
        findings.push(...f.map((x) => ({ ...x, pattern: `header:${key}:${x.pattern}` })));
        if (h) hasHigh = true;
        cleanHeaders[rawKey] = mode === "block" ? scrubbed : (rawVal as string | string[] | undefined);
        continue;
      }
    }

    cleanHeaders[rawKey] = rawVal as string | string[] | undefined;
  }

  if (findings.length > 0) {
    console.warn(
      `[exfil-guard] headers ${opts.direction}/${mode} ctx=${opts.context ?? "?"} findings=${findings.length}`,
    );
    recordAudit(findings, opts, "headers");
  }

  return {
    cleanText: "",
    cleanHeaders,
    findings,
    blocked: mode === "block" && hasHigh,
  };
}

export function guardJson<T>(
  payload: T,
  opts: GuardOptions,
): { cleanPayload: T; findings: GuardFinding[]; blocked: boolean } {
  if (payload === null || payload === undefined) {
    return { cleanPayload: payload, findings: [], blocked: false };
  }

  const mode = opts.mode ?? "log";
  const allFindings: GuardFinding[] = [];
  let hasHigh = false;
  let nodeCount = 0;

  // Iterative DFS walk. Each frame holds (parent, key, value). We can't mutate
  // `payload` in place for primitives (strings are immutable), so we rebuild
  // containers when we need to scrub. On mode="log" we never mutate.
  // To keep things simple and predictable: do a deep clone only if scrubbing
  // (mode="block") and any finding occurs. Otherwise return payload as-is.
  //
  // Two-pass approach: pass 1 walks + collects findings; pass 2 (only if needed)
  // rebuilds a scrubbed copy. This avoids the complexity of in-place edits to
  // arbitrary nested structures.

  type Frame = { value: unknown };
  const stack: Frame[] = [{ value: payload }];

  while (stack.length > 0) {
    if (++nodeCount > MAX_JSON_NODES) break;
    const frame = stack.pop() as Frame;
    const v = frame.value;

    if (typeof v === "string") {
      const { findings, hasHigh: h } = scanText(v, opts.direction);
      if (findings.length > 0) {
        allFindings.push(...findings);
        if (h) hasHigh = true;
      }
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push({ value: v[i] });
    } else if (v !== null && typeof v === "object") {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        stack.push({ value: (v as Record<string, unknown>)[key] });
      }
    }
    // numbers/booleans/null/undefined: no-op
  }

  let cleanPayload: T = payload;
  if (mode === "block" && allFindings.length > 0) {
    cleanPayload = scrubJsonDeep(payload, opts.direction) as T;
  }

  if (allFindings.length > 0) {
    console.warn(
      `[exfil-guard] json ${opts.direction}/${mode} ctx=${opts.context ?? "?"} findings=${allFindings.length}`,
    );
    recordAudit(allFindings, opts, "json");
  }

  return {
    cleanPayload,
    findings: allFindings,
    blocked: mode === "block" && hasHigh,
  };
}

// Rebuild a scrubbed copy of a JSON value. Called only in mode="block" when
// findings exist, so the extra allocation is acceptable.
function scrubJsonDeep(value: unknown, direction: GuardDirection): unknown {
  if (typeof value === "string") {
    const { scrubbed } = scanText(value, direction);
    return scrubbed;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubJsonDeep(item, direction));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = scrubJsonDeep((value as Record<string, unknown>)[k], direction);
    }
    return out;
  }
  return value;
}
