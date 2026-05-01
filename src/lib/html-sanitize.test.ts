import { describe, it, expect } from "vitest";
import { sanitizeDocumentContent, sanitizeStoredHtml } from "./html-sanitize";

describe("stored HTML sanitization", () => {
  it("strips script tags before storing HTML documents", () => {
    const sanitized = sanitizeStoredHtml("<p>ok</p><script>alert(1)</script>");

    expect(sanitized).toContain("<p>ok</p>");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("alert(1)");
  });

  it("strips event-handler attributes before storing HTML documents", () => {
    const sanitized = sanitizeDocumentContent('<img src="/x.png" onerror="alert(1)">', "html");

    expect(sanitized).toContain("<img");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("alert(1)");
  });

  it("strips javascript: URLs before storing HTML documents", () => {
    const sanitized = sanitizeDocumentContent('<a href=javascript:alert(1)>click</a>', "html");

    expect(sanitized).toContain("click");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("alert(1)");
  });

  it("strips dangerous style attributes and plugin containers", () => {
    const sanitized = sanitizeStoredHtml('<iframe src="/x"></iframe><object data="/x"></object><embed src="/x"><p style="background:url(javascript:alert(1))">ok</p>');

    expect(sanitized).toContain("<p>ok</p>");
    expect(sanitized).not.toContain("<iframe");
    expect(sanitized).not.toContain("<object");
    expect(sanitized).not.toContain("<embed");
    expect(sanitized).not.toContain("style=");
  });

  it("strips entity-encoded handlers and whitespace script closures", () => {
    const sanitized = sanitizeStoredHtml('<img src="/x" o&#110;error="alert(1)"><script>alert(2)</script >');

    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("o&#110;error");
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("alert(");
  });

  it("does not rewrite markdown content on write", () => {
    expect(sanitizeDocumentContent("[click](javascript:alert(1))", "markdown")).toBe("[click](javascript:alert(1))");
  });
});
