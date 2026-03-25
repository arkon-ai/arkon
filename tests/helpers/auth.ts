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

/** Parse a cookie value from a Set-Cookie header string */
function parseCookieValue(setCookie: string, name: string): string | null {
  // Handle multiple Set-Cookie values (may be joined with comma or newline)
  const pattern = new RegExp(`(?:^|[,\\n])\\s*${name}=([^;]+)`, "i");
  const match = setCookie.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Authenticate a Playwright browser context by hitting /api/auth/init
 * and injecting the returned cookies. Returns the CSRF token for use
 * in mutation requests.
 */
export async function authenticate(context: BrowserContext): Promise<string> {
  const response = await context.request.post(`${MC_URL}/api/auth/init`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });

  if (!response.ok()) {
    throw new Error(`Auth failed: ${response.status()} ${await response.text()}`);
  }

  const domain = getCookieDomain();
  let csrfToken = "";

  // Check if cookies were auto-captured by Playwright
  const cookies = await context.cookies(MC_URL);
  const existingCsrf = cookies.find((c) => c.name === "mc_csrf");
  if (existingCsrf) {
    csrfToken = existingCsrf.value;
  }

  if (!cookies.some((c) => c.name === "mc_auth")) {
    // Auth init returns Set-Cookie — manually parse and inject
    const setCookie = response.headers()["set-cookie"] ?? "";
    if (setCookie.includes("mc_auth")) {
      const authVal = parseCookieValue(setCookie, "mc_auth");
      const csrfVal = parseCookieValue(setCookie, "mc_csrf");
      const roleVal = parseCookieValue(setCookie, "mc_role");
      const tenantVal = parseCookieValue(setCookie, "mc_tenant");
      const toSet = [];
      if (authVal) toSet.push({ name: "mc_auth", value: authVal, domain, path: "/" });
      if (csrfVal) {
        toSet.push({ name: "mc_csrf", value: csrfVal, domain, path: "/" });
        csrfToken = csrfVal;
      }
      if (roleVal) toSet.push({ name: "mc_role", value: roleVal, domain, path: "/" });
      if (tenantVal) toSet.push({ name: "mc_tenant", value: tenantVal, domain, path: "/" });
      if (toSet.length) await context.addCookies(toSet);
    }
  }

  return csrfToken;
}

/**
 * Get auth headers for API requests (Bearer token — CSRF exempt).
 */
export function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${ADMIN_TOKEN}` };
}

/**
 * Get auth headers for cookie-authenticated mutation requests.
 * Pass the CSRF token returned by authenticate().
 */
export function csrfHeaders(csrfToken: string): Record<string, string> {
  return { "x-csrf-token": csrfToken };
}
