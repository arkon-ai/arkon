import { test, expect, type Page } from "@playwright/test";
import { MC_URL, authenticate, csrfHeaders } from "../helpers/auth";

/* ── Sign Out ends the server session (transformate WI-3990, deck-main RULING 4124) ──
   mc_auth is httpOnly: the UI cannot clear it from JS, so Sign Out must go through
   POST /api/auth/logout (which answers Set-Cookie expiring it), with the CSRF header. */

// Each case uses its own context: logging out must not touch the shared admin storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test("POST /api/auth/logout expires mc_auth and the other auth cookies @regression @security", async ({ browser }) => {
  const context = await browser.newContext();
  const csrfToken = await authenticate(context);
  const res = await context.request.post(`${MC_URL}/api/auth/logout`, { headers: csrfHeaders(csrfToken) });
  expect(res.status()).toBe(200);
  const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
  for (const name of ["mc_auth", "mc_csrf", "mc_role", "mc_tenant", "mc_user_session"]) {
    const line = setCookie.find((v) => v.startsWith(`${name}=;`) || v.startsWith(`${name}=`));
    expect(line, name).toBeTruthy();
    expect(line!, name).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  }
  expect(setCookie.find((v) => v.startsWith("mc_auth="))!).toMatch(/HttpOnly/i);
  await context.close();
});

async function signOutFrom(page: Page, path: string) {
  const logout = page.waitForRequest((r) => r.url().endsWith("/api/auth/logout") && r.method() === "POST", { timeout: 10000 });
  await page.goto(`${MC_URL}${path}`);
  // the shells render the button twice (mobile drawer + desktop sidebar); click the visible one
  await page.getByRole("button", { name: /sign out/i }).filter({ visible: true }).first().click();
  const req = await logout;
  expect(req.headers()["x-csrf-token"], "Sign Out sends the double-submit token").toBeTruthy();
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  // the httpOnly session cookie is gone, so the API no longer accepts this browser
  const after = await page.request.get(`${MC_URL}/api/dashboard/overview`);
  expect(after.status()).toBe(401);
}

test("Sign Out (app shell) calls POST /api/auth/logout and ends the session @regression @security", async ({ browser }) => {
  const context = await browser.newContext();
  await authenticate(context);
  const page = await context.newPage();
  await signOutFrom(page, "/");
  await context.close();
});

test("Sign Out (client portal shell) calls POST /api/auth/logout and ends the session @regression @security", async ({ browser }) => {
  const context = await browser.newContext();
  await authenticate(context);
  const page = await context.newPage();
  await signOutFrom(page, "/client");
  await context.close();
});
