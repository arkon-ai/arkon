import { test as setup, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

setup("authenticate as admin", async ({ request }) => {
  const res = await request.post(`${MC_URL}/api/auth/init`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  expect(res.ok()).toBeTruthy();

  // Playwright auto-captures Set-Cookie headers into the request context.
  // Persist the authenticated state so all dependent projects reuse it.
  await request.storageState({ path: "tests/.auth/admin.json" });
});
