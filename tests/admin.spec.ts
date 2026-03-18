import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

test.describe("Admin API", () => {
  test("GET /api/admin/agents returns 200 with auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/admin/agents returns 401 without auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/infra/nodes returns 200 with auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
  });
});

test.describe("Admin Panel Page", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("/admin page returns 200", async ({ page }) => {
    const response = await page.goto(`${MC_URL}/admin`);
    expect(response?.status()).toBe(200);
  });

  test("/admin page renders without 500 error", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    const title = await page.title();
    expect(title).not.toContain("500");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
