import { describe, it, expect, vi, beforeEach } from "vitest";
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
