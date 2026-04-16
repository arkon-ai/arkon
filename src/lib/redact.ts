/**
 * Redaction layer — strips sensitive content BEFORE database storage.
 * This runs on the ingest side. By the time data is in PostgreSQL, it's clean.
 *
 * Patterns live in `redact-patterns.ts` (shared with exfil-guard.ts).
 */

import { SHARED_PATTERN_REGEXES } from "./redact-patterns";

const MAX_CONTENT_LENGTH = 5000; // Truncate very long content

export function redactContent(content: string): { text: string; redacted: boolean } {
  if (!content) return { text: "", redacted: false };

  let redacted = false;
  let result = content;

  // Clone each regex per call — `g` flag carries stateful `lastIndex` that can
  // corrupt under async interleaving. (Sentinel audit 2026-04-16, FIX-FIRST #1.)
  for (const source of SHARED_PATTERN_REGEXES) {
    const re = new RegExp(source.source, source.flags);
    const before = result;
    result = result.replace(re, "[REDACTED]");
    if (result !== before) redacted = true;
  }

  // Truncate very long content (likely file dumps)
  if (result.length > MAX_CONTENT_LENGTH) {
    result = result.slice(0, MAX_CONTENT_LENGTH) + "\n... [TRUNCATED at " + MAX_CONTENT_LENGTH + " chars]";
    redacted = true;
  }

  return { text: result, redacted };
}
