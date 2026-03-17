/**
 * Redaction layer — strips sensitive content BEFORE database storage.
 * This runs on the ingest side. By the time data is in PostgreSQL, it's clean.
 */

const SENSITIVE_PATTERNS = [
  // API keys
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /xoxb-[a-zA-Z0-9_-]+/g,
  /xoxp-[a-zA-Z0-9_-]+/g,
  /ghp_[a-zA-Z0-9]{36,}/g,
  /glpat-[a-zA-Z0-9_-]{20,}/g,

  // Bearer tokens in content
  /Bearer\s+[a-zA-Z0-9._-]{20,}/g,

  // Generic key=value patterns
  /(?:api_key|apikey|api-key|token|secret|password|passwd|pwd)\s*[=:]\s*['"]?[a-zA-Z0-9_./+=-]{8,}['"]?/gi,

  // AWS keys
  /AKIA[0-9A-Z]{16}/g,

  // Connection strings with passwords
  /(?:postgresql|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/g,

  // SSH private keys
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

const MAX_CONTENT_LENGTH = 5000; // Truncate very long content

export function redactContent(content: string): { text: string; redacted: boolean } {
  if (!content) return { text: "", redacted: false };

  let redacted = false;
  let result = content;

  for (const pattern of SENSITIVE_PATTERNS) {
    const before = result;
    result = result.replace(pattern, "[REDACTED]");
    if (result !== before) redacted = true;
  }

  // Truncate very long content (likely file dumps)
  if (result.length > MAX_CONTENT_LENGTH) {
    result = result.slice(0, MAX_CONTENT_LENGTH) + "\n... [TRUNCATED at " + MAX_CONTENT_LENGTH + " chars]";
    redacted = true;
  }

  return { text: result, redacted };
}
