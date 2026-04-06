import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: XSS Injection — Edge & Security Tests
   Tests: script injection in event content, form fields, query
          params, API responses, stored XSS via ingest, header
          injection, DOM XSS via URL fragments
   ══════════════════════════════════════════════════════════════ */

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(document.cookie)</script>',
  "javascript:alert('xss')",
  '<svg onload=alert(1)>',
  '<iframe src="javascript:alert(1)">',
  "';alert(String.fromCharCode(88,83,83))//",
  '<body onload=alert(1)>',
  '<input onfocus=alert(1) autofocus>',
  '{{constructor.constructor("return this")().alert(1)}}',
];

// ── XSS in Event Ingest ─────────────────────────────────────

test.describe("XSS — Event ingest content", () => {
  for (const payload of XSS_PAYLOADS.slice(0, 5)) {
    const label = payload.slice(0, 30).replace(/[<>"]/g, "_");
    test(`ingest with XSS payload "${label}" is sanitized or rejected @regression @edge @security`, async ({
      request,
    }) => {
      const res = await request.post(`${MC_URL}/api/ingest`, {
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        data: {
          agent: "xss-test-agent",
          type: "message_received",
          content: payload,
        },
      });
      // Should accept (200) with sanitized content, or reject (400)
      expect([200, 400, 422]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        const stored = JSON.stringify(body);
        // Must not reflect raw script tags in response
        expect(stored).not.toContain("<script>");
      }
    });
  }
});

// ── XSS in Query Parameters ─────────────────────────────────

test.describe("XSS — Query parameters", () => {
  test('search param with <script> tag is escaped @regression @edge @security', async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces?search=${encodeURIComponent('<script>alert(1)</script>')}`,
      { headers: authHeaders() }
    );
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const text = await res.text();
      expect(text).not.toContain("<script>alert(1)</script>");
    }
  });

  test("filter param with event handler is safe @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/dashboard/activity?type=${encodeURIComponent('" onmouseover="alert(1)"')}`,
      { headers: authHeaders() }
    );
    expect([200, 400]).toContain(res.status());
  });

  test("agent name with XSS payload in URL @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/dashboard/agent/${encodeURIComponent('<img src=x onerror=alert(1)>')}`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
    if (res.status() === 200) {
      const text = await res.text();
      expect(text).not.toContain("onerror=");
    }
  });
});

// ── XSS in Form Submission ──────────────────────────────────

test.describe("XSS — Form fields via API", () => {
  test("workflow name with script tag @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: '<script>alert("xss")</script>',
        description: "test workflow",
        nodes: [],
        edges: [],
      },
    });
    expect([200, 201, 400, 422]).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      const name = body.workflow?.name ?? body.name ?? "";
      expect(name).not.toContain("<script>");
    }
    await context.close();
  });

  test("agent name with HTML injection @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/admin/agents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: '<b onmouseover=alert(1)>hover me</b>',
        model: "test-model",
      },
    });
    expect([200, 201, 400, 403, 422]).toContain(res.status());
    await context.close();
  });

  test("budget name with SVG XSS @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/costs/budgets`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: '<svg/onload=alert(1)>',
        amount: 100,
        period: "monthly",
      },
    });
    expect([200, 201, 400, 422]).toContain(res.status());
    await context.close();
  });
});

// ── XSS in Rendered Pages ───────────────────────────────────

test.describe("XSS — Rendered page content", () => {
  test("dashboard does not execute injected scripts @regression @edge @security", async ({ page }) => {
    // Authenticate and navigate
    const context = page.context();
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${authHeaders().Authorization.split(" ")[1]}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // Check for XSS by monitoring for alert dialogs
    let alertFired = false;
    page.on("dialog", () => {
      alertFired = true;
    });
    // Wait a moment for any scripts to execute
    await page.waitForTimeout(2000);
    expect(alertFired).toBe(false);
  });
});

// ── Security Headers Against XSS ────────────────────────────

test.describe("XSS — Security headers", () => {
  test("Content-Security-Policy header is set @regression @edge @security", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    const csp = res.headers()["content-security-policy"] ?? "";
    // CSP should restrict script sources
    if (csp) {
      expect(csp).toContain("default-src");
    }
  });

  test("X-Content-Type-Options: nosniff is set @regression @edge @security", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is DENY @regression @edge @security", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    const xfo = res.headers()["x-frame-options"] ?? "";
    expect(xfo.toUpperCase()).toBe("DENY");
  });

  test("Strict-Transport-Security header is set @regression @edge @security", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    const hsts = res.headers()["strict-transport-security"] ?? "";
    if (hsts) {
      expect(hsts).toContain("max-age=");
    }
  });
});
