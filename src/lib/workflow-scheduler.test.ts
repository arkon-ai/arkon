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
  // Force real timers first so any pending fake-timer callbacks from a prior
  // test cannot leak into module state during reset.
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.mocked(query).mockResolvedValue({ rows: [] } as never);
  stopScheduler(); // reset running flag + interval
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

  it("lastTick is null after stopScheduler when scheduler was never started in this test", () => {
    // stopScheduler in beforeEach resets module state, so lastTick is null
    // regardless of test ordering.
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

  it("stopScheduler cancels the pending alignment setTimeout (no orphan tick)", async () => {
    vi.useFakeTimers();
    // Pin "now" to xx:00:30 so the alignment delay is exactly 30s
    vi.setSystemTime(new Date("2026-04-26T10:00:30.000Z"));

    const queryMock = vi.mocked(query);
    queryMock.mockClear();

    startScheduler();
    // First tick fires synchronously inside startScheduler — query called once
    expect(queryMock).toHaveBeenCalledTimes(1);

    stopScheduler();
    expect(getSchedulerStatus().running).toBe(false);

    // Advance past the 30s alignment delay AND a full subsequent minute.
    // If stopScheduler did not clear the alignment setTimeout, the orphan
    // callback would fire and call query() again (and start the 60s interval).
    await vi.advanceTimersByTimeAsync(90_000);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(getSchedulerStatus().running).toBe(false);
  });
});
