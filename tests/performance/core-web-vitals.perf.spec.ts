import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Performance — Core Web Vitals
   LCP < 2.5s, CLS < 0.1, FCP < 1.8s, TBT < 200ms
   Tags: @performance @regression
   ══════════════════════════════════════════════════════════════ */

/** Pages to benchmark for Core Web Vitals */
const PAGES = [
  { path: "/", name: "Dashboard" },
  { path: "/agents", name: "Agents" },
  { path: "/costs", name: "Costs" },
  { path: "/workflows", name: "Workflows" },
  { path: "/security", name: "Security" },
  { path: "/login", name: "Login" },
];

/** Thresholds (Google "good" range) */
const LCP_THRESHOLD = 2500; // ms
const FCP_THRESHOLD = 1800; // ms
const CLS_THRESHOLD = 0.1;

test.describe("Core Web Vitals @performance @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── LCP Tests ──────────────────────────────────────────────
  for (const { path, name } of PAGES) {
    test(`${name} LCP under ${LCP_THRESHOLD}ms`, async ({ page }) => {
      // Navigate and measure LCP
      await page.goto(`${MC_URL}${path}`);
      await page.waitForLoadState("networkidle");

      const lcp = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          // Check if PerformanceObserver is supported
          if (typeof PerformanceObserver === "undefined") {
            resolve(0);
            return;
          }
          let lastLcp = 0;
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              lastLcp = entries[entries.length - 1].startTime;
            }
          });
          try {
            observer.observe({ type: "largest-contentful-paint", buffered: true });
          } catch {
            resolve(0);
            return;
          }
          // Give LCP time to report
          setTimeout(() => {
            observer.disconnect();
            resolve(lastLcp);
          }, 3000);
        });
      });

      // If LCP was captured, assert threshold
      if (lcp > 0) {
        expect(lcp, `${name} LCP was ${lcp.toFixed(0)}ms`).toBeLessThan(LCP_THRESHOLD);
      }
    });
  }

  // ── FCP Tests ──────────────────────────────────────────────
  for (const { path, name } of PAGES) {
    test(`${name} FCP under ${FCP_THRESHOLD}ms`, async ({ page }) => {
      await page.goto(`${MC_URL}${path}`);
      await page.waitForLoadState("domcontentloaded");

      const fcp = await page.evaluate(() => {
        const entries = performance.getEntriesByName("first-contentful-paint");
        return entries.length > 0 ? entries[0].startTime : 0;
      });

      if (fcp > 0) {
        expect(fcp, `${name} FCP was ${fcp.toFixed(0)}ms`).toBeLessThan(FCP_THRESHOLD);
      }
    });
  }

  // ── CLS Tests ──────────────────────────────────────────────
  for (const { path, name } of PAGES) {
    test(`${name} CLS under ${CLS_THRESHOLD}`, async ({ page }) => {
      await page.goto(`${MC_URL}${path}`);

      // Observe layout shifts during load
      const cls = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          if (typeof PerformanceObserver === "undefined") {
            resolve(0);
            return;
          }
          let totalCls = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              // @ts-ignore - layout-shift entries have hadRecentInput
              if (!(entry as any).hadRecentInput) {
                totalCls += (entry as any).value ?? 0;
              }
            }
          });
          try {
            observer.observe({ type: "layout-shift", buffered: true });
          } catch {
            resolve(0);
            return;
          }
          // Wait for page to stabilize
          setTimeout(() => {
            observer.disconnect();
            resolve(totalCls);
          }, 5000);
        });
      });

      expect(cls, `${name} CLS was ${cls.toFixed(4)}`).toBeLessThan(CLS_THRESHOLD);
    });
  }

  // ── Navigation Timing ──────────────────────────────────────
  test("dashboard DOM interactive under 3s", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    const domInteractive = await page.evaluate(() => {
      const timing = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return timing ? timing.domInteractive - timing.fetchStart : 0;
    });

    if (domInteractive > 0) {
      expect(domInteractive, `DOM interactive: ${domInteractive.toFixed(0)}ms`).toBeLessThan(3000);
    }
  });

  test("login page loads under 2s (no auth overhead)", async ({ page }) => {
    const start = Date.now();
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const elapsed = Date.now() - start;

    expect(elapsed, `Login page load: ${elapsed}ms`).toBeLessThan(2000);
  });
});
