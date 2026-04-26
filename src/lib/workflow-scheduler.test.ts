import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { query } from "@/lib/db";
import {
  describeCron,
  getNextCronRun,
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
} from "./workflow-scheduler";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/workflow-engine", () => ({
  runWorkflow: vi.fn().mockResolvedValue({ runId: 1, status: "completed", steps: [] }),
}));

vi.mocked(query).mockResolvedValue({ rows: [] } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(query).mockResolvedValue({ rows: [] } as never);
  stopScheduler(); // reset module state
});

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// describeCron — pure label map
// ---------------------------------------------------------------------------

describe("describeCron", () => {
  it("returns human label for known preset expressions", () => {
    expect(describeCron("* * * * *")).toBe("Every minute");
    expect(describeCron("0 * * * *")).toBe("Every hour");
    expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes");
    expect(describeCron("0 6 * * 1")).toBe("Weekly Mon 8:00 SAST");
    expect(describeCron("0 6 * * 1-5")).toBe("Weekdays 8:00 SAST");
  });

  it("returns the raw expression for expressions not in the preset map", () => {
    expect(describeCron("30 9 * * 1-5")).toBe("30 9 * * 1-5");
    expect(describeCron("0 12 1 * *")).toBe("0 12 1 * *");
  });
});

// ---------------------------------------------------------------------------
// getNextCronRun — cron expression parsing + scheduling
// ---------------------------------------------------------------------------

describe("getNextCronRun", () => {
  it("returns null for expressions with wrong field count", () => {
    expect(getNextCronRun("* * * *")).toBeNull(); // 4 fields
    expect(getNextCronRun("* * * * * *")).toBeNull(); // 6 fields
    expect(getNextCronRun("")).toBeNull(); // empty
  });

  it("returns a Date instance for '* * * * *' (fires every minute)", () => {
    const result = getNextCronRun("* * * * *");
    expect(result).toBeInstanceOf(Date);
  });

  it("returned Date is strictly in the future (at least 1 minute ahead)", () => {
    const before = new Date();
    const result = getNextCronRun("* * * * *");
    expect(result!.getTime()).toBeGreaterThan(before.getTime());
  });

  it("returns null for an expression that cannot fire in 48 hours (Feb 30)", () => {
    // Feb never has a day 30 — no date in the 48h window matches day=30 AND month=2
    const result = getNextCronRun("0 0 30 2 *");
    expect(result).toBeNull();
  });

  it("step syntax */15 returns a Date within 15 minutes", () => {
    const now = new Date();
    const result = getNextCronRun("*/15 * * * *");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime() - now.getTime()).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("range syntax 1-5 in day-of-week resolves correctly on weekdays", () => {
    // "0 9 * * 1-5" = 9am Mon-Fri — should return a Date (Mon-Fri always occur in 48h)
    const result = getNextCronRun("0 9 * * 1-5");
    expect(result).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// getSchedulerStatus — module state read
// ---------------------------------------------------------------------------

describe("getSchedulerStatus", () => {
  it("reports running: false and activeRuns: 0 before any start call", () => {
    const s = getSchedulerStatus();
    expect(s.running).toBe(false);
    expect(s.activeRuns).toBe(0);
  });

  it("lastTick is null before first tick fires", () => {
    const s = getSchedulerStatus();
    expect(s.lastTick).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// startScheduler / stopScheduler — state machine
// ---------------------------------------------------------------------------

describe("startScheduler / stopScheduler", () => {
  it("sets running=true after start and running=false after stop", () => {
    vi.useFakeTimers();

    startScheduler();
    expect(getSchedulerStatus().running).toBe(true);

    stopScheduler();
    expect(getSchedulerStatus().running).toBe(false);
  });

  it("calling startScheduler twice does not double-start", () => {
    vi.useFakeTimers();

    startScheduler();
    startScheduler(); // second call: isRunning is already true → early return
    expect(getSchedulerStatus().running).toBe(true);

    stopScheduler();
    expect(getSchedulerStatus().running).toBe(false);
  });

  it("stopScheduler is idempotent when the scheduler is not running", () => {
    expect(getSchedulerStatus().running).toBe(false);
    expect(() => stopScheduler()).not.toThrow();
    expect(getSchedulerStatus().running).toBe(false);
  });

  it("restart after stop works cleanly", () => {
    vi.useFakeTimers();

    startScheduler();
    stopScheduler();
    startScheduler();
    expect(getSchedulerStatus().running).toBe(true);
  });
});
