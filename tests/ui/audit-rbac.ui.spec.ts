import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Sessions Page UI ────────────────────────── */

test.describe("Sessions Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("sessions settings page loads @regression", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/settings/sessions`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("domcontentloaded");
  });
});
