import { type BrowserContext, type APIRequestContext } from "@playwright/test";

export const MC_URL = process.env.ARKON_BASE_URL || "http://localhost:3000";
export const ADMIN_TOKEN = process.env.MC_ADMIN_TOKEN || "test-admin-token";
/** Agent token env may be "name:token" format — extract just the token */
export const AGENT_TOKEN = (() => {
  const raw = process.env.MC_AGENT_TOKEN || "test-agent-token";
  const colonIdx = raw.indexOf(":");
  return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
})();

/** Extract hostname from MC_URL for cookie domain */
function getCookieDomain(): string {
  try {
    return new URL(MC_URL).hostname;
  } catch {
    return "localhost";
  }
}

/**
 * Authenticate a Playwright browser context by hitting /api/auth/init
 * and injecting the returned cookies.
 */
export async function authenticate(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${MC_URL}/api/auth/init`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });

  if (!response.ok()) {
    throw new Error(`Auth failed: ${response.status()} ${await response.text()}`);
  }

  const domain = getCookieDomain();

  // Cookies are set by the server — Playwright captures them automatically via context.request
  // For page-level auth, visit a page that triggers the cookie read
  const cookies = await context.cookies(MC_URL);
  if (!cookies.some((c) => c.name === "mc_auth")) {
    // Auth init returns Set-Cookie — manually parse if needed
    const setCookie = response.headers()["set-cookie"] ?? "";
    if (setCookie.includes("mc_auth")) {
      // Parse and set cookies manually
      const authMatch = setCookie.match(/mc_auth=([^;]+)/);
      const csrfMatch = setCookie.match(/mc_csrf=([^;]+)/);
      const roleMatch = setCookie.match(/mc_role=([^;]+)/);
      const toSet = [];
      if (authMatch) toSet.push({ name: "mc_auth", value: authMatch[1], domain, path: "/" });
      if (csrfMatch) toSet.push({ name: "mc_csrf", value: csrfMatch[1], domain, path: "/" });
      if (roleMatch) toSet.push({ name: "mc_role", value: roleMatch[1], domain, path: "/" });
      if (toSet.length) await context.addCookies(toSet);
    }
  }
}

/**
 * Get auth headers for API requests.
 */
export function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${ADMIN_TOKEN}` };
}
