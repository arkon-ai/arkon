/**
 * redact-patterns — shared secret-regex source of truth.
 *
 * Zero dependencies. Imported by `redact.ts` (inbound ingest scrubber) and
 * `exfil-guard.ts` (bidirectional middleware). Both files extend with their
 * own local additions (e.g. exfil-guard's `high-entropy-token` + `private-ip`
 * are outbound-only and stay in exfil-guard.ts).
 *
 * Dependency flow: redact-patterns → nothing; redact.ts → redact-patterns;
 * exfil-guard.ts → redact-patterns. No cycles.
 */

/**
 * Metadata-rich pattern definition used by exfil-guard's finding/audit pipeline.
 * `redact.ts` only needs the raw RegExp list, which it derives from SHARED_PATTERNS
 * via a thin accessor at the bottom of this file.
 */
export interface SharedPatternDef {
  name: string;
  regex: RegExp;
  severity: "high" | "medium" | "low";
  /**
   * Optional per-candidate exclusion shapes. When a candidate matches the main
   * regex but also any of these, it is skipped (not recorded, not scrubbed).
   * Used to suppress high-false-positive shapes like SHA/UUID on entropy-based
   * heuristics. (Sentinel audit 2026-04-16, FIX-FIRST #2.)
   */
  excludeShapes?: RegExp[];
}

/**
 * Patterns common to inbound redaction and outbound exfil-guard.
 * All regexes use the `g` flag so `.replace` / `.matchAll` work as expected.
 * Callers MUST clone per-use (new RegExp(re.source, re.flags)) because `g`
 * regexes carry stateful `lastIndex` that can corrupt under async interleaving.
 */
export const SHARED_PATTERNS: SharedPatternDef[] = [
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
];

/**
 * Raw-regex view for callers that only need the list without metadata
 * (e.g. redact.ts's simple-iterate-and-replace loop).
 */
export const SHARED_PATTERN_REGEXES: readonly RegExp[] = SHARED_PATTERNS.map((p) => p.regex);
