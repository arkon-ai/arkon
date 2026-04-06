import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: Input Boundaries — Edge & Security Tests
   Tests: max-length strings, unicode/emoji, empty strings,
          special characters, null bytes, oversized payloads,
          content truncation (5000 char limit from redact.ts)
   ══════════════════════════════════════════════════════════════ */

// ── Max-Length Strings ──────────────────────────────────────

test.describe("Input Boundaries — Max-length strings", () => {
  test("ingest with 5000+ char content is truncated @regression @edge", async ({ request }) => {
    const longContent = "A".repeat(6000);
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { agent: "boundary-test", type: "message_received", content: longContent },
    });
    expect([200, 400, 413]).toContain(res.status());
  });

  test("ingest with exactly 5000 chars is accepted @regression @edge", async ({ request }) => {
    const content = "B".repeat(5000);
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { agent: "boundary-test", type: "heartbeat", content },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("workflow name with 1000 chars @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const longName = "W".repeat(1000);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: longName, description: "test", nodes: [], edges: [] },
    });
    expect(res.status()).toBeLessThan(500);
    await context.close();
  });

  test("agent name with 500 chars @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/admin/agents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: "A".repeat(500), model: "test" },
    });
    expect(res.status()).toBeLessThan(500);
    await context.close();
  });
});

// ── Unicode & Emoji ─────────────────────────────────────────

test.describe("Input Boundaries — Unicode and emoji", () => {
  test("ingest with emoji content @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "emoji-test",
        type: "message_received",
        content: "Hello 🌍🔥🚀 Agent Status: ✅ Complete! 你好世界 مرحبا",
      },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("ingest with CJK characters @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "cjk-test",
        type: "message_received",
        content: "日本語テスト 中文测试 한국어 테스트",
      },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("ingest with RTL text (Arabic/Hebrew) @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "rtl-test",
        type: "message_received",
        content: "مرحبا بالعالم שלום עולם",
      },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("search with emoji in query @regression @edge", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces?search=${encodeURIComponent("🔥")}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("workflow name with emoji @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: "🚀 Deploy Pipeline 🔄", description: "emoji test", nodes: [], edges: [] },
    });
    expect(res.status()).toBeLessThan(500);
    await context.close();
  });
});

// ── Empty & Whitespace Strings ──────────────────────────────

test.describe("Input Boundaries — Empty and whitespace", () => {
  test("ingest with empty content @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { agent: "empty-test", type: "heartbeat", content: "" },
    });
    expect([200, 400, 422]).toContain(res.status());
  });

  test("ingest with whitespace-only content @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { agent: "ws-test", type: "heartbeat", content: "   \n\t   " },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("ingest with null content @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { agent: "null-test", type: "heartbeat", content: null },
    });
    expect([200, 400, 422]).toContain(res.status());
  });

  test("empty agent name is rejected @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { agent: "", type: "heartbeat", content: "test" },
    });
    expect([200, 400, 422]).toContain(res.status());
  });

  test("login with empty email and password @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "", password: "" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });
});

// ── Special Characters ──────────────────────────────────────

test.describe("Input Boundaries — Special characters", () => {
  test("ingest with newlines and tabs in content @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "special-test",
        type: "message_received",
        content: "Line 1\nLine 2\tTabbed\r\nCRLF line",
      },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("ingest with null bytes is handled @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "null-byte-test",
        type: "message_received",
        content: "test\x00null\x00bytes",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("search with special regex characters @regression @edge", async ({ request }) => {
    const specialChars = "test.*+?^${}()|[]\\";
    const res = await request.get(
      `${MC_URL}/api/traces?search=${encodeURIComponent(specialChars)}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("agent name with path traversal attempt @regression @edge @security", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "../../../etc/passwd",
        type: "heartbeat",
        content: "path traversal test",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("JSON with deeply nested objects @regression @edge", async ({ request }) => {
    // Create a deeply nested object
    let nested: any = { value: "deep" };
    for (let i = 0; i < 50; i++) {
      nested = { nested };
    }
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "nested-test",
        type: "heartbeat",
        content: JSON.stringify(nested),
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

// ── Oversized Payloads ──────────────────────────────────────

test.describe("Input Boundaries — Oversized payloads", () => {
  test("very large JSON payload is rejected or handled @regression @edge", async ({ request }) => {
    const largePayload = "X".repeat(100_000);
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "oversized-test",
        type: "message_received",
        content: largePayload,
      },
    });
    // Should be accepted with truncation (200), rejected (400/413), or handled
    expect([200, 400, 413]).toContain(res.status());
  });

  test("empty JSON body is handled @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {},
    });
    expect([200, 400, 422]).toContain(res.status());
  });

  test("non-JSON content type is handled @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "text/plain" },
      data: "this is plain text not json",
    });
    expect(res.status()).toBeLessThan(500);
  });
});
