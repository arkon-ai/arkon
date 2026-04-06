import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authenticate } from "./auth";

/**
 * Custom Arkon test fixtures.
 *
 * - authenticatedPage: a page with admin cookies already set
 * - adminContext: a fresh browser context authenticated as admin
 * - clientContext: a fresh browser context authenticated as client
 */
export const test = base.extend<{
  authenticatedPage: Page;
  adminContext: BrowserContext;
  clientContext: BrowserContext;
}>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    await authenticate(context);
    const page = await context.newPage();
    await page.goto(MC_URL);
    await use(page);
    await context.close();
  },

  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await authenticate(context);
    await use(context);
    await context.close();
  },

  clientContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    // Client-level auth with limited permissions
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: {
        Authorization: `Bearer ${process.env.MC_CLIENT_TOKEN || "test-client-token"}`,
      },
    });
    await use(context);
    await context.close();
  },
});

export { expect };
