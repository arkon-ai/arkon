import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 2,
  timeout: 45000,
  workers: process.env.CI ? 2 : 4,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],

  use: {
    baseURL: process.env.ARKON_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    // Setup project — runs auth once, shares storageState
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    // Desktop Chrome visual baselines — run FIRST, on the freshly seeded DB. The other specs write
    // data (ingest, workflows, docs, agents) that the costs/workflows/agents screens show, so a
    // screenshot taken alongside them depends on test order (transformate WI-3989). Snapshot files
    // keep the "-chromium-desktop" name. If a visual case fails, Playwright skips chromium-desktop.
    {
      name: "chromium-desktop-visual",
      testMatch: /visual\/.*\.visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/admin.json" },
      snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-chromium-desktop{-snapshotSuffix}{ext}",
      dependencies: ["setup"],
    },
    // Desktop Chrome (primary)
    {
      name: "chromium-desktop",
      testIgnore: /visual\/.*\.visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/admin.json" },
      dependencies: ["setup", "chromium-desktop-visual"],
    },
    // Mobile Chrome
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 5"], storageState: "tests/.auth/admin.json" },
      dependencies: ["setup"],
    },
    // Firefox (cross-browser)
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], storageState: "tests/.auth/admin.json" },
      dependencies: ["setup"],
    },
    // Safari (cross-browser)
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], storageState: "tests/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
});
