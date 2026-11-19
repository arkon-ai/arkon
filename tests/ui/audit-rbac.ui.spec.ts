import { test, expect } from "@playwright/test";
import { MC_URL, authenticate } from "../helpers/auth";

/* ── Sessions Page UI ────────────────────────── */

test.describe("Sessions Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await authenticate(context);
  });

  test("sessions settings page loads @regression", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/settings/sessions`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("domcontentloaded");
  });
});
