export const DEFAULT_MCP_REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0";

/**
 * The MCP registry base URL. MCP_REGISTRY_BASE overrides it so CI's E2E can point the
 * route at a local fixture (deck-main RULING 4864 (1)); unset keeps the official registry.
 * Anything but a credential-free http(s) URL falls back to the default with one server log
 * line that never carries the value.
 */
export function mcpRegistryBase(): string {
  const raw = process.env.MCP_REGISTRY_BASE;
  if (!raw) return DEFAULT_MCP_REGISTRY_BASE;
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    /* not a URL */
  }
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    console.warn("[mcp-registry] MCP_REGISTRY_BASE is not a credential-free http(s) URL; using the official registry");
    return DEFAULT_MCP_REGISTRY_BASE;
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}
