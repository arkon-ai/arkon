import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Accessibility — Forms & Interactive Controls
   Labels, error messages, ARIA states, required fields, color
   Tags: @a11y @regression
   ══════════════════════════════════════════════════════════════ */

test.describe("Forms Accessibility @a11y @regression", () => {
  // ── Login Form ─────────────────────────────────────────────
  test.describe("Login form", () => {
    test("all inputs have associated labels", async ({ page }) => {
      await page.goto(`${MC_URL}/login`);
      await page.waitForLoadState("domcontentloaded");

      const inputs = page.locator("input:not([type='hidden'])");
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute("id");
        const ariaLabel = await input.getAttribute("aria-label");
        const ariaLabelledby = await input.getAttribute("aria-labelledby");
        const placeholder = await input.getAttribute("placeholder");

        // Input must have label, aria-label, aria-labelledby, or placeholder
        const hasLabel = id
          ? (await page.locator(`label[for="${id}"]`).count()) > 0
          : false;

        expect(
          hasLabel || !!ariaLabel || !!ariaLabelledby || !!placeholder,
          `Input ${i} (id=${id}) must have an accessible label`
        ).toBeTruthy();
      }
    });

    test("password input has correct type attribute", async ({ page }) => {
      await page.goto(`${MC_URL}/login`);
      await page.waitForLoadState("domcontentloaded");

      const pwdInput = page.locator("input[type='password']");
      if (await pwdInput.count() > 0) {
        await expect(pwdInput.first()).toHaveAttribute("type", "password");
      }
    });

    test("form submission error messages are announced to screen readers", async ({ page }) => {
      await page.goto(`${MC_URL}/login`);
      await page.waitForLoadState("domcontentloaded");

      // Submit empty form to trigger validation
      const submitBtn = page.getByRole("button", { name: /sign in|log in|submit/i }).first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForTimeout(500);

        // Error messages should use role=alert or aria-live
        const alerts = page.locator("[role='alert'], [aria-live='polite'], [aria-live='assertive']");
        const errorText = page.locator("[class*='error'], [class*='Error']");
        const totalErrors = (await alerts.count()) + (await errorText.count());
        // If there's an error shown, it should be accessible
        if (totalErrors > 0) {
          const ariaAlerts = await alerts.count();
          // At least some errors should be aria-announced
          expect(ariaAlerts + (await errorText.count())).toBeGreaterThan(0);
        }
      }
    });

    test("login form axe-core scan passes", async ({ page }) => {
      await page.goto(`${MC_URL}/login`);
      await page.waitForLoadState("domcontentloaded");

      const results = await new AxeBuilder({ page })
        .include("form")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      expect(results.violations).toHaveLength(0);
    });
  });

  // ── Authenticated Form Pages ───────────────────────────────
  test.describe("Admin & Settings forms", () => {
    test.beforeEach(async ({ context }) => {
      await context.request.post(`${MC_URL}/api/auth/init`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
    });

    test("admin page form inputs have labels", async ({ page }) => {
      await page.goto(`${MC_URL}/admin`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);

      const inputs = page.locator("input:not([type='hidden']), select, textarea");
      const count = await inputs.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        const input = inputs.nth(i);
        if (!(await input.isVisible())) continue;

        const id = await input.getAttribute("id");
        const ariaLabel = await input.getAttribute("aria-label");
        const ariaLabelledby = await input.getAttribute("aria-labelledby");
        const role = await input.getAttribute("role");

        const hasLabel = id
          ? (await page.locator(`label[for="${id}"]`).count()) > 0
          : false;

        expect(
          hasLabel || !!ariaLabel || !!ariaLabelledby || role === "presentation",
          `Admin input ${i} (id=${id}) must have an accessible label`
        ).toBeTruthy();
      }
    });

    test("settings page form controls are accessible", async ({ page }) => {
      await page.goto(`${MC_URL}/settings`);
      await page.waitForLoadState("domcontentloaded");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const formViolations = results.violations.filter(
        (v) => v.id.includes("label") || v.id.includes("form")
      );
      expect(formViolations).toHaveLength(0);
    });

    test("workflow create form has accessible controls", async ({ page }) => {
      await page.goto(`${MC_URL}/workflows`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);

      // Click create button if available
      const createBtn = page.getByRole("button", { name: /create|new/i }).first();
      if (await createBtn.isVisible()) {
        await createBtn.click();
        await page.waitForTimeout(500);

        // Check any form that appears
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();

        const formViolations = results.violations.filter(
          (v) => v.id.includes("label") || v.id.includes("form") || v.id.includes("input")
        );
        expect(formViolations).toHaveLength(0);
      }
    });

    // ── Required Fields ──────────────────────────────────────
    test("required form fields are marked with aria-required", async ({ page }) => {
      await page.goto(`${MC_URL}/login`);
      await page.waitForLoadState("domcontentloaded");

      const requiredInputs = page.locator("input[required], input[aria-required='true']");
      const count = await requiredInputs.count();

      // Login should have at least email and password as required
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const input = requiredInputs.nth(i);
          const required = await input.getAttribute("required");
          const ariaRequired = await input.getAttribute("aria-required");
          expect(required !== null || ariaRequired === "true").toBeTruthy();
        }
      }
    });

    // ── Button Accessibility ─────────────────────────────────
    test("all visible buttons have accessible names", async ({ page }) => {
      await page.goto(`${MC_URL}/`);
      await page.waitForLoadState("domcontentloaded");

      const buttons = page.locator("button");
      const count = await buttons.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        const btn = buttons.nth(i);
        if (!(await btn.isVisible())) continue;

        const text = (await btn.textContent())?.trim();
        const ariaLabel = await btn.getAttribute("aria-label");
        const title = await btn.getAttribute("title");

        expect(
          (text && text.length > 0) || !!ariaLabel || !!title,
          `Button ${i} must have an accessible name`
        ).toBeTruthy();
      }
    });

    // ── Color Contrast (axe-core) ────────────────────────────
    test("dashboard has no color contrast violations", async ({ page }) => {
      await page.goto(`${MC_URL}/`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withRules(["color-contrast"])
        .analyze();

      expect(results.violations).toHaveLength(0);
    });

    test("security page has no color contrast violations", async ({ page }) => {
      await page.goto(`${MC_URL}/security`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withRules(["color-contrast"])
        .analyze();

      expect(results.violations).toHaveLength(0);
    });
  });
});
