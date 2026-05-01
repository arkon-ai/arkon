import { describe, expect, it } from "vitest";
import { sanitizeHtmlForRender } from "./tools";

describe("tools document HTML rendering", () => {
  it("returns empty HTML when DOMPurify cannot run instead of falling back to raw HTML", () => {
    expect(sanitizeHtmlForRender('<img src="/x" onerror="alert(1)">')).toBe("");
  });
});
