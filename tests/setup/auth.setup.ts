import { test as setup, expect } from "@playwright/test";
import { MC_URL, OWNER_EMAIL, OWNER_PASSWORD } from "../helpers/auth";

// The owner signs in by the session road (transformate WI-4493): /api/auth/init is retired (410, zero cookie).
setup("authenticate as admin", async ({ request }) => {
  const res = await request.post(`${MC_URL}/api/auth/login`, {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();

  // Playwright auto-captures Set-Cookie headers into the request context.
  // Persist the authenticated state so all dependent projects reuse it.
  await request.storageState({ path: "tests/.auth/admin.json" });
});
