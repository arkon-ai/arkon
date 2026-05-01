import DOMPurify from "isomorphic-dompurify";

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "ul", "ol", "li", "a", "strong", "em",
    "code", "pre", "blockquote", "table", "thead", "tbody",
    "tr", "th", "td", "hr", "br", "img", "span", "div",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "class", "id", "target", "rel"],
  FORBID_ATTR: ["style"],
};

export function sanitizeStoredHtml(input: string): string {
  return DOMPurify.sanitize(input, SANITIZE_CONFIG);
}

export function sanitizeDocumentContent(content: string, contentFormat: string): string {
  if (contentFormat.toLowerCase() !== "html") return content;
  return sanitizeStoredHtml(content);
}
