const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_TAG = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const JS_PROTOCOL = /\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi;
const DATA_HTML_PROTOCOL = /\s+(href|src)\s*=\s*(["'])\s*data:text\/html[\s\S]*?\2/gi;

export function sanitizeStoredHtml(input: string): string {
  return input
    .replace(SCRIPT_TAG, "")
    .replace(EVENT_HANDLER_ATTR, "")
    .replace(JS_PROTOCOL, "")
    .replace(DATA_HTML_PROTOCOL, "");
}

export function sanitizeDocumentContent(content: string, contentFormat: string): string {
  if (contentFormat.toLowerCase() !== "html") return content;
  return sanitizeStoredHtml(content);
}
