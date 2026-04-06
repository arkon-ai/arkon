import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Performance — Bundle Size & Resource Loading
   Ensures JS/CSS bundles stay within budget, no oversized assets.
   Tags: @performance @regression
   ══════════════════════════════════════════════════════════════ */

/** Max sizes in bytes */
const MAX_JS_BUNDLE_TOTAL = 2 * 1024 * 1024; // 2MB total JS
const MAX_SINGLE_JS_CHUNK = 500 * 1024; // 500KB per chunk
const MAX_CSS_TOTAL = 500 * 1024; // 500KB total CSS
const MAX_IMAGE_SINGLE = 1 * 1024 * 1024; // 1MB per image
const MAX_TOTAL_PAGE_WEIGHT = 5 * 1024 * 1024; // 5MB total

test.describe("Bundle Size & Resource Budgets @performance @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("dashboard total JS bundle under 2MB", async ({ page }) => {
    const jsRequests: { url: string; size: number }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.match(/\.(js|mjs)(\?|$)/) && response.status() === 200) {
        try {
          const body = await response.body();
          jsRequests.push({ url, size: body.length });
        } catch {
          // Some responses may not have bodies
        }
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");

    const totalJs = jsRequests.reduce((sum, r) => sum + r.size, 0);
    expect(
      totalJs,
      `Total JS: ${(totalJs / 1024).toFixed(0)}KB across ${jsRequests.length} files`
    ).toBeLessThan(MAX_JS_BUNDLE_TOTAL);
  });

  test("no single JS chunk exceeds 500KB", async ({ page }) => {
    const oversized: { url: string; size: number }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.match(/\.(js|mjs)(\?|$)/) && response.status() === 200) {
        try {
          const body = await response.body();
          if (body.length > MAX_SINGLE_JS_CHUNK) {
            oversized.push({ url: url.split("/").pop() || url, size: body.length });
          }
        } catch {}
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");

    expect(
      oversized,
      `Oversized chunks: ${oversized.map((r) => `${r.url} (${(r.size / 1024).toFixed(0)}KB)`).join(", ")}`
    ).toHaveLength(0);
  });

  test("total CSS under 500KB", async ({ page }) => {
    const cssRequests: { url: string; size: number }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.match(/\.css(\?|$)/) && response.status() === 200) {
        try {
          const body = await response.body();
          cssRequests.push({ url, size: body.length });
        } catch {}
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");

    const totalCss = cssRequests.reduce((sum, r) => sum + r.size, 0);
    expect(
      totalCss,
      `Total CSS: ${(totalCss / 1024).toFixed(0)}KB`
    ).toBeLessThan(MAX_CSS_TOTAL);
  });

  test("no single image exceeds 1MB", async ({ page }) => {
    const oversized: { url: string; size: number }[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      const contentType = response.headers()["content-type"] || "";
      if (contentType.startsWith("image/") && response.status() === 200) {
        try {
          const body = await response.body();
          if (body.length > MAX_IMAGE_SINGLE) {
            oversized.push({ url: url.split("/").pop() || url, size: body.length });
          }
        } catch {}
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");

    expect(
      oversized,
      `Oversized images: ${oversized.map((r) => `${r.url} (${(r.size / 1024).toFixed(0)}KB)`).join(", ")}`
    ).toHaveLength(0);
  });

  test("total page weight under 5MB", async ({ page }) => {
    let totalBytes = 0;

    page.on("response", async (response) => {
      if (response.status() === 200) {
        try {
          const body = await response.body();
          totalBytes += body.length;
        } catch {}
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");

    expect(
      totalBytes,
      `Total page weight: ${(totalBytes / 1024 / 1024).toFixed(2)}MB`
    ).toBeLessThan(MAX_TOTAL_PAGE_WEIGHT);
  });

  test("JS resources are gzip/brotli compressed", async ({ page }) => {
    const uncompressed: string[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (url.match(/\.(js|mjs|css)(\?|$)/) && response.status() === 200) {
        const encoding = response.headers()["content-encoding"];
        if (!encoding || !encoding.match(/gzip|br|deflate/)) {
          uncompressed.push(url.split("/").pop() || url);
        }
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");

    // Allow some uncompressed (e.g., tiny inline), but flag if many
    expect(
      uncompressed.length,
      `Uncompressed assets: ${uncompressed.join(", ")}`
    ).toBeLessThan(5);
  });

  test("no render-blocking third-party scripts", async ({ page }) => {
    const blockingScripts: string[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      // Flag third-party scripts that aren't from our domain
      if (
        url.match(/\.(js|mjs)(\?|$)/) &&
        response.status() === 200 &&
        !url.includes("localhost") &&
        !url.includes("_next") &&
        !url.includes(MC_URL)
      ) {
        blockingScripts.push(url.split("/").pop() || url);
      }
    });

    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Should not have excessive third-party JS
    expect(
      blockingScripts.length,
      `Third-party scripts: ${blockingScripts.join(", ")}`
    ).toBeLessThan(5);
  });
});
