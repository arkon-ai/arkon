import { describe, it, expect } from "vitest";
import { sanitizeDocumentContent, sanitizeStoredHtml } from "./html-sanitize";

describe("stored HTML sanitization", () => {
  it("strips script tags before storing HTML documents", () => {
    expect(sanitizeStoredHtml("<p>ok</p><script>alert(1)</script>")).toBe("<p>ok</p>");
  });

  it("strips event-handler attributes before storing HTML documents", () => {
    expect(sanitizeDocumentContent('<img src="/x.png" onerror="alert(1)">', "html")).toBe('<img src="/x.png">');
  });

  it("strips javascript: URLs before storing HTML documents", () => {
    expect(sanitizeDocumentContent('<a href="javascript:alert(1)">click</a>', "html")).toBe("<a>click</a>");
  });

  it("does not rewrite markdown content on write", () => {
    expect(sanitizeDocumentContent("[click](javascript:alert(1))", "markdown")).toBe("[click](javascript:alert(1))");
  });
});
