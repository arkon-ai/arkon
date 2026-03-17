import { type BrowserContext, type APIRequestContext } from "@playwright/test";

export const MC_URL = process.env.ARKON_BASE_URL || "http://localhost:3000";
export const ADMIN_TOKEN = process.env.MC_ADMIN_TOKEN || "test-admin-token";
export const AGENT_TOKEN = process.env.MC_AGENT_TOKEN || "test-agent-token";

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
      if (authMatch) toSet.push({ name: "mc_auth", value: authMatch[1], domain: "localhost", path: "/" });
      if (csrfMatch) toSet.push({ name: "mc_csrf", value: csrfMatch[1], domain: "localhost", path: "/" });
      if (roleMatch) toSet.push({ name: "mc_role", value: roleMatch[1], domain: "localhost", path: "/" });
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
