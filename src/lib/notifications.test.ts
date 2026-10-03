import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { query } from "@/lib/db";
import {
  resolveNotificationTenantId,
  getSystemTenantId,
  sendNotification,
  LEGACY_TENANT_SENTINEL,
} from "./notifications";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ARKON_SYSTEM_TENANT_ID;
});

// The bug (WI-1693): callers pass tenant_id 'default', but the setup wizard
// renames the seeded 'default' tenant to the real owner tenant, so 'default'
// is not a valid tenants row — every insert violated the FK (~258k failures).
// These tests pin the resolution that keeps 'default' from ever reaching the DB.

describe("resolveNotificationTenantId", () => {
  it("passes a real caller-supplied tenant id through untouched", async () => {
    const id = await resolveNotificationTenantId("hofmi");
    expect(id).toBe("hofmi");
    // Real context must not trigger a tenants lookup.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps the legacy 'default' sentinel to the owner tenant", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "transformate" }] } as never);
    const id = await resolveNotificationTenantId(LEGACY_TENANT_SENTINEL);
    expect(id).toBe("transformate");
  });

  it("maps an empty/undefined tenant to the owner tenant", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "transformate" }] } as never);
    const id = await resolveNotificationTenantId();
    expect(id).toBe("transformate");
  });

  it("prefers ARKON_SYSTEM_TENANT_ID over a tenants lookup", async () => {
    process.env.ARKON_SYSTEM_TENANT_ID = "hofmi-team-1";
    const id = await resolveNotificationTenantId(LEGACY_TENANT_SENTINEL);
    expect(id).toBe("hofmi-team-1");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns null when no tenant exists so the caller can skip the write", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    expect(await getSystemTenantId()).toBeNull();
  });

  it("returns null (not a throw) when the tenants lookup fails", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    expect(await getSystemTenantId()).toBeNull();
  });
});

describe("sendNotification tenant resolution", () => {
  it("inserts under the resolved owner tenant, never the literal 'default'", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "transformate" }] } as never) // resolve tenant
      .mockResolvedValue({ rows: [] } as never); // INSERT + prefs + push subs

    await sendNotification({
      tenantId: "default",
      type: "infra_offline",
      severity: "critical",
      title: "Node offline",
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO notifications"),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe("transformate"); // tenant_id bind
    // Regression guard: the FK-violating sentinel must never reach the insert.
    expect(params).not.toContain("default");
  });

  it("skips the insert entirely when no tenant resolves (no FK-violating write)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never); // resolve -> none

    await sendNotification({
      tenantId: "default",
      type: "anomaly",
      severity: "warning",
      title: "Rate spike",
    });

    const insertCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO notifications"),
    );
    expect(insertCall).toBeUndefined();
  });
});

// transformate WI-3986: threat and approval alerts went dark for an unknown
// time because no notification_preferences row existed, and nothing said so.
// A threat or approval that reaches ZERO external channels must log the fixed
// marker NOTIFY-DARK, so a dark route is visible in the server log.

describe("sendNotification external delivery (WI-3986)", () => {
  const TENANT = "sys-tenant";
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.ARKON_SYSTEM_TENANT_ID = TENANT;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Query order inside sendNotification: INSERT, prefs SELECT, push_subscriptions.
  function prefRows(rows: unknown[]) {
    mockQuery.mockImplementation(async (sql: string) =>
      (String(sql).includes("notification_preferences") ? { rows } : { rows: [] }) as never,
    );
  }

  const telegram = (types?: Record<string, boolean>) => ({
    channel: "telegram",
    config: { bot_token: "BOT-TOKEN-SECRET", chat_id: "4242", ...(types ? { types } : {}) },
  });

  const okTelegram = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const notFound = () => ({ ok: false, status: 404, json: async () => ({ ok: false }) });

  const threat = (severity: "critical" | "warning" = "critical") =>
    sendNotification({ tenantId: "default", type: "threat", severity, title: "T" });

  const darkLines = () =>
    errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.includes("NOTIFY-DARK"));

  it("a1: no enabled row -> logs NOTIFY-DARK with the prefKey and resolved tenant", async () => {
    prefRows([]);
    await threat("critical");
    expect(darkLines()).toEqual([`NOTIFY-DARK threat_critical tenant=${TENANT}`]);
  });

  it("a2: an enabled email-only row is not a delivery -> NOTIFY-DARK", async () => {
    prefRows([{ channel: "email", config: { address: "x@example.com" } }]);
    await sendNotification({ tenantId: "default", type: "approval", severity: "critical", title: "A" });
    expect(darkLines()).toEqual([`NOTIFY-DARK approval tenant=${TENANT}`]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a3: a telegram row whose types exclude the prefKey -> NOTIFY-DARK", async () => {
    prefRows([telegram({ threat_high: false, threat_critical: true, approval: true })]);
    await threat("warning");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(darkLines()).toEqual([`NOTIFY-DARK threat_high tenant=${TENANT}`]);
  });

  it("a4: a telegram row whose fetch returns 404 -> NOTIFY-DARK", async () => {
    prefRows([telegram()]);
    fetchMock.mockResolvedValue(notFound());
    await threat("critical");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(darkLines()).toEqual([`NOTIFY-DARK threat_critical tenant=${TENANT}`]);
  });

  it("the marker never carries a config value", async () => {
    prefRows([telegram()]);
    fetchMock.mockResolvedValue(notFound());
    await threat("critical");
    for (const line of darkLines()) {
      expect(line).not.toContain("BOT-TOKEN-SECRET");
      expect(line).not.toContain("4242");
    }
  });

  it("a delivered telegram dispatch logs no NOTIFY-DARK", async () => {
    prefRows([telegram()]);
    fetchMock.mockResolvedValue(okTelegram());
    await threat("critical");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(darkLines()).toEqual([]);
  });

  it("one delivered row among a failed and an email row logs no NOTIFY-DARK", async () => {
    prefRows([telegram(), { channel: "email", config: {} }, { channel: "discord", config: { webhook_url: "https://d.example/x" } }]);
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("telegram") ? notFound() : { ok: true, status: 204 },
    );
    await threat("critical");
    expect(darkLines()).toEqual([]);
  });

  it("a non-alert type with no row logs no NOTIFY-DARK", async () => {
    prefRows([]);
    await sendNotification({ tenantId: "default", type: "infra_offline", severity: "critical", title: "N" });
    expect(darkLines()).toEqual([]);
  });

  // 1b CHARACTERISATION: a row without config.types gets the three alert keys.
  it("1b: a row with no config.types dispatches threat_critical, threat_high and approval once each", async () => {
    prefRows([telegram()]);
    fetchMock.mockResolvedValue(okTelegram());
    await threat("critical");
    await threat("warning");
    await sendNotification({ tenantId: "default", type: "approval", severity: "info", title: "A" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse((init as RequestInit).body as string).chat_id).toBe("4242");
    }
  });

  it("1b: types.approval=false does not dispatch approval", async () => {
    prefRows([telegram({ approval: false, threat_critical: true, threat_high: true })]);
    fetchMock.mockResolvedValue(okTelegram());
    await sendNotification({ tenantId: "default", type: "approval", severity: "info", title: "A" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 1c CHARACTERISATION: a failed dispatch is logged and never throws.
  it("1c: a 404 dispatch logs the channel failure and does not throw", async () => {
    prefRows([telegram()]);
    fetchMock.mockResolvedValue(notFound());
    await expect(threat("critical")).resolves.toBeUndefined();
    expect(
      errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes("[notifications] Failed to dispatch to telegram")),
    ).toBe(true);
  });
});
