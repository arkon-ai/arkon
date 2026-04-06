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
    // Desktop Chrome (primary)
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/admin.json" },
      dependencies: ["setup"],
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
