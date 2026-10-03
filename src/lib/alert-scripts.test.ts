import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { inspect } from "util";
import { query } from "@/lib/db";
import {
  checkAlertChannel,
  envPresenceLine,
  loadArkonEnv,
  DEFAULT_ARKON_DIR,
} from "../../scripts/check-alert-channel";
import { fireTestAlerts, TEST_MARK } from "../../scripts/fire-test-alerts";

// transformate WI-3986: the two production scripts behind F2 (check) and F3
// (test-fire). These cases prove their import wiring, their tenant guard and
// their fetch spy with a mocked query and a mocked fetch: no network, no DB.

vi.mock("@/lib/db", () => ({ query: vi.fn(), default: { end: vi.fn() } }));

const mockQuery = vi.mocked(query);
const fetchMock = vi.fn();
const SECRET = "BOT-TOKEN-SECRET";
const TENANT = "sys-tenant";
let logs: string[];

const telegramRow = { channel: "telegram", config: { bot_token: SECRET, chat_id: "4242" } };

type ServerRow = { tenant_id: string; type: string; title: string; created_at: string };

// The notifications SELECT applies the script's own filters (a type list, a
// title NOT LIKE), so a change to the filter line changes what the mock returns.
function db(opts: { prefs?: unknown[]; serverRows?: ServerRow[] }) {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = String(sql);
    if (s.includes("notification_preferences")) return { rows: opts.prefs ?? [] } as never;
    if (s.includes("FROM notifications")) {
      let rows = opts.serverRows ?? [];
      const types = /type IN \(([^)]*)\)/.exec(s);
      if (types) rows = rows.filter((r) => types[1].includes(`'${r.type}'`));
      if (/title NOT LIKE \$1/.test(s)) {
        const mark = String(params?.[0]).replace(/%/g, "");
        rows = rows.filter((r) => !r.title.includes(mark));
      }
      return { rows } as never;
    }
    return { rows: [] } as never; // INSERT, push_subscriptions
  });
}

// Every console arg in full (an Error with its message, stack and cause).
const show = (args: unknown[]) =>
  args.map((x) => (typeof x === "string" ? x : inspect(x, { depth: 5 }))).join(" ");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.ARKON_SYSTEM_TENANT_ID = TENANT;
  delete process.env.ALERT_MIN_LEVEL;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logs.push(show(a)));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logs.push(show(a)));
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logs.push(show(a)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ARKON_SYSTEM_TENANT_ID;
});

const noSecret = () => {
  for (const l of logs) {
    expect(l).not.toContain(SECRET);
    expect(l).not.toContain("4242");
  }
};

describe("env loading (N1)", () => {
  it("defaults to the deployed Arkon dir, never this checkout", () => {
    expect(DEFAULT_ARKON_DIR).toBe("/home/brynn/arkon");
  });

  it("loads .env.local from ARKON_DIR and reports presence by name only", () => {
    const dir = mkdtempSync(join(tmpdir(), "wi3986-"));
    try {
      writeFileSync(join(dir, ".env.local"), "ALERT_MIN_LEVEL=fixture-value-wi3986\n");
      process.env.ARKON_DIR = dir;
      // Next skips .env.local when NODE_ENV=test; the script runs in production mode.
      vi.stubEnv("NODE_ENV", "production");
      expect(loadArkonEnv()).toBe(dir);
      expect(process.env.ALERT_MIN_LEVEL).toBe("fixture-value-wi3986");
      const line = envPresenceLine();
      expect(line).toContain("ALERT_MIN_LEVEL=set");
      expect(line).toContain("ARKON_SYSTEM_TENANT_ID=set");
      expect(line).not.toContain("fixture-value-wi3986");
      expect(line).not.toContain(TENANT);
    } finally {
      vi.unstubAllEnvs();
      delete process.env.ARKON_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("check-alert-channel (F2)", () => {
  it("telegram getChat ok -> live, exit 0, prints the system tenant and no config value", async () => {
    db({ prefs: [telegramRow] });
    fetchMock.mockResolvedValue(json(200, { ok: true, result: { id: 4242 } }));
    expect(await checkAlertChannel()).toBe(0);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/getChat?chat_id=4242");
    expect(logs).toContain(`system tenant: ${TENANT}`);
    expect(logs).toContain("telegram: live");
    expect(logs).toContain("live: telegram");
    // The prefs query reads the system tenant, never 'default' (the TRAP).
    const prefCall = mockQuery.mock.calls.find(([s]) => String(s).includes("notification_preferences"));
    expect(prefCall![1]).toEqual([TENANT]);
    noSecret();
  });

  it("no enabled row -> DARK, exit 1", async () => {
    db({ prefs: [] });
    expect(await checkAlertChannel()).toBe(1);
    expect(logs).toContain("DARK: no enabled notification_preferences row");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("telegram API not ok -> DARK, exit 1", async () => {
    db({ prefs: [telegramRow] });
    fetchMock.mockResolvedValue(json(401, { ok: false }));
    expect(await checkAlertChannel()).toBe(1);
    expect(logs).toContain("telegram: DARK API not ok (HTTP 401)");
    noSecret();
  });

  it("missing keys, slack and webhook rows read DARK, exit 1", async () => {
    db({
      prefs: [
        { channel: "telegram", config: { bot_token: SECRET } },
        { channel: "slack", config: { webhook_url: "https://hooks.example/s" } },
        { channel: "webhook", config: { url: "https://hooks.example/w" } },
      ],
    });
    expect(await checkAlertChannel()).toBe(1);
    expect(logs).toEqual(
      expect.arrayContaining([
        "telegram: DARK missing keys",
        "slack: DARK not checked live",
        "webhook: DARK not checked live",
        "DARK: no row answered ok",
      ]),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    noSecret();
  });

  it("a throwing fetch reads DARK by error name only", async () => {
    db({ prefs: [{ channel: "discord", config: { webhook_url: `https://d.example/${SECRET}` } }] });
    fetchMock.mockRejectedValue(new TypeError(`fetch failed https://d.example/${SECRET}`));
    expect(await checkAlertChannel()).toBe(1);
    expect(logs).toContain("discord: DARK request failed (TypeError)");
    noSecret();
  });

  it("discord webhook GET ok -> live, exit 0", async () => {
    db({ prefs: [{ channel: "discord", config: { webhook_url: "https://d.example/x" } }] });
    fetchMock.mockResolvedValue(json(200, {}));
    expect(await checkAlertChannel()).toBe(0);
    expect(logs).toContain("live: discord");
  });
});

describe("fire-test-alerts (F3)", () => {
  const serverRow: ServerRow = {
    tenant_id: TENANT,
    type: "threat",
    title: "HIGH threat detected — agent-x",
    created_at: "2026-10-03T10:00:00Z",
  };

  it("fires 2 threats + 1 approval through the real alert path; the spy prints ok + message_id only", async () => {
    db({ prefs: [telegramRow], serverRows: [serverRow] });
    let id = 100;
    fetchMock.mockImplementation(async () => json(200, { ok: true, result: { message_id: ++id, chat: { id: 4242 } } }));

    expect(await fireTestAlerts()).toBe(0);

    expect(logs).toContain(`resolved tenant: ${TENANT}`);
    expect(logs.filter((l) => l.startsWith("spy "))).toEqual([
      "spy telegram ok=true message_id=101",
      "spy telegram ok=true message_id=102",
      "spy telegram ok=true message_id=103",
    ]);
    expect(logs.some((l) => l.includes("NOTIFY-DARK"))).toBe(false);

    // In-app rows: the resolved tenant, never 'default'; test ids; marked titles.
    const inserts = mockQuery.mock.calls.filter(([s]) => String(s).includes("INSERT INTO notifications"));
    expect(inserts).toHaveLength(3);
    for (const [, p] of inserts) {
      const params = p as unknown[];
      expect(params[0]).toBe(TENANT);
      expect(String(params[3])).toContain(TEST_MARK);
    }
    const [t1, t2, ap] = inserts.map(([, p]) => p as unknown[]);
    expect([t1[1], t1[2]]).toEqual(["threat", "critical"]);
    expect([t2[1], t2[2]]).toEqual(["threat", "warning"]);
    expect([ap[1], ap[2]]).toEqual(["approval", "critical"]);
    expect(JSON.parse(String(t1[6])).agentId).toBe("test-wi3986-1");
    expect(JSON.parse(String(ap[6])).approvalId).toBe("test-wi3986-3");

    // The independent check excludes this script's own rows.
    const check = mockQuery.mock.calls.find(([s]) => String(s).includes("FROM notifications"));
    expect(check![1]).toEqual([`%${TEST_MARK}%`]);
    // The spy is removed afterwards.
    expect(globalThis.fetch).toBe(fetchMock);
    noSecret();
  });

  it("a Telegram 200 with ok:false prints ok=false (an HTTP 200 alone is not delivery)", async () => {
    db({ prefs: [telegramRow], serverRows: [serverRow] });
    fetchMock.mockImplementation(async () => json(200, { ok: false }));
    expect(await fireTestAlerts()).toBe(0);
    expect(logs.filter((l) => l.startsWith("spy "))[0]).toBe("spy telegram ok=false message_id=none");
  });

  it("STOPS before firing when no server-written threat/approval row exists (N3)", async () => {
    db({ prefs: [telegramRow], serverRows: [] });
    expect(await fireTestAlerts()).toBe(1);
    expect(logs.some((l) => l.startsWith("STOP: no server-written"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([s]) => String(s).includes("INSERT"))).toBe(false);
  });

  // FOLD 1 (RULING 4072): production has never held a threat/approval row; its
  // server rows are infra_offline, written through the same tenant resolver.
  it("a non-alert server row (infra_offline) on the resolved tenant lets the check pass", async () => {
    db({
      prefs: [telegramRow],
      serverRows: [{ ...serverRow, type: "infra_offline", title: "Node offline" }],
    });
    fetchMock.mockImplementation(async () => json(200, { ok: true, result: { message_id: 1 } }));
    expect(await fireTestAlerts()).toBe(0);
    expect(logs).toContain(`newest server-written row: tenant=${TENANT} at ${serverRow.created_at}`);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ignores a row whose title carries the TEST mark (a script-written row)", async () => {
    db({
      prefs: [telegramRow],
      serverRows: [{ ...serverRow, type: "threat", title: `CRITICAL threat detected — ${TEST_MARK}` }],
    });
    expect(await fireTestAlerts()).toBe(1);
    expect(logs.some((l) => l.startsWith("STOP: no server-written"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // FOLD 2 (MAJOR 2): the REAL fetch rejects a malformed webhook URL while
  // parsing it (no network). The error text carries the URL; no log may.
  it("a dispatch error never prints the configured webhook value (real fetch)", async () => {
    vi.unstubAllGlobals(); // this case uses the real fetch
    // FAKE fixture value, not a real webhook: an invalid URL that cannot be fetched.
    const FAKE_URL = "ht!tp://fixture-wi3986-marker";
    db({
      prefs: [{ channel: "discord", config: { webhook_url: FAKE_URL } }],
      serverRows: [serverRow],
    });
    expect(await fireTestAlerts()).toBe(0);
    expect(logs.some((l) => l.includes("Failed to dispatch to discord"))).toBe(true);
    for (const l of logs) expect(l).not.toContain("fixture-wi3986-marker");
  });

  it("STOPS before firing when the server-written row's tenant differs", async () => {
    db({ prefs: [telegramRow], serverRows: [{ ...serverRow, tenant_id: "other" }] });
    expect(await fireTestAlerts()).toBe(1);
    expect(logs).toContain("STOP: resolved tenant differs from the server-written row's tenant");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
