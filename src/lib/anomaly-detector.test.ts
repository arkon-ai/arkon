import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";
import { recomputeBaselines, checkAnomalies } from "./anomaly-detector";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

const mockQuery = vi.mocked(query);
const mockSend = vi.mocked(sendNotification);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// recomputeBaselines
// ---------------------------------------------------------------------------

describe("recomputeBaselines", () => {
  it("inserts one baseline row per agent returned by the SELECT", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { agent_id: "a1", avg_hourly_events: 42 },
          { agent_id: "a2", avg_hourly_events: 7 },
        ],
      } as never)
      .mockResolvedValue({ rows: [] } as never);

    await recomputeBaselines();

    // 1 SELECT + 2 INSERTs
    expect(mockQuery).toHaveBeenCalledTimes(3);
    const insertCalls = mockQuery.mock.calls.slice(1);
    expect(insertCalls[0][1]).toEqual(["a1", 42]);
    expect(insertCalls[1][1]).toEqual(["a2", 7]);
  });

  it("makes no INSERT calls when no agents are found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await recomputeBaselines();

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// checkAnomalies — rate spikes
// ---------------------------------------------------------------------------

describe("checkAnomalies — rate spikes", () => {
  it("fires a HIGH alert and notification when multiplier ≥ 3×", async () => {
    // baseline=10, events_last_5min=3 → currentRate=36, multiplier=3.6
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 3 }],
      } as never) // recentRates
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", avg_hourly_events: 10 }],
      } as never) // baselines
      .mockResolvedValueOnce({ rows: [] } as never) // spike dedup — no recent alert
      .mockResolvedValue({ rows: [] } as never); // INSERT + any further

    await checkAnomalies();

    const insertCall = mockQuery.mock.calls[3];
    expect(insertCall[0]).toContain("INSERT INTO anomaly_alerts");
    const args = insertCall[1] as unknown[];
    expect(args[0]).toBe("a1");
    expect(args[1]).toBe("rate_spike");
    expect(args[2]).toBe("high");

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toMatchObject({ type: "anomaly", severity: "warning" });
  });

  it("fires a MEDIUM alert without notification when 2× ≤ multiplier < 3×", async () => {
    // baseline=10, events_last_5min=2 → currentRate=24, multiplier=2.4
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 2 }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 10 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValue({ rows: [] } as never);

    await checkAnomalies();

    const insertCall = mockQuery.mock.calls[3];
    const args = insertCall[1] as unknown[];
    expect(args[2]).toBe("medium");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not alert when multiplier is below 2×", async () => {
    // baseline=10, events_last_5min=1 → currentRate=12, multiplier=1.2
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 1 }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 10 }] } as never);

    await checkAnomalies();

    // Only 2 query calls — no dedup check, no INSERT
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips an agent with no baseline in the map", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 5 }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never); // baselines empty

    await checkAnomalies();

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips an agent whose baseline is < 1 (insufficient history)", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 5 }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 0.5 }] } as never);

    await checkAnomalies();

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips a spike already alerted within 30 minutes (dedup)", async () => {
    // multiplier 3.6× HIGH, but dedup row exists
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 3 }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 10 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: 99 }] } as never); // dedup returns existing

    await checkAnomalies();

    // 3 queries (recentRates, baselines, dedup) — no INSERT
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkAnomalies — silence detection
// ---------------------------------------------------------------------------

describe("checkAnomalies — silence detection", () => {
  it("fires a silence alert when agent with baseline > 2 was recently active but now silent", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // recentRates — no active agents
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 5 }] } as never) // baselines
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] } as never) // wasActive — had events last hour
      .mockResolvedValueOnce({ rows: [] } as never) // recentSilence dedup — none
      .mockResolvedValueOnce({ rows: [] } as never) // INSERT silence alert
      .mockResolvedValue({ rows: [{ name: "Agent One" }] } as never); // name lookup

    await checkAnomalies();

    const silenceInsert = mockQuery.mock.calls[4];
    expect(silenceInsert[0]).toContain("rate_silence");
    expect(silenceInsert[1]).toEqual(["a1", 5]);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0]).toMatchObject({ type: "agent_offline" });
  });

  it("does not check silence for agents with baseline ≤ 2", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never) // recentRates empty
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 2 }] } as never); // baseline = 2 (not > 2)

    await checkAnomalies();

    // Only 2 queries — silence loop body never entered
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips silence alert when agent has no events in last hour", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 5 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never); // wasActive empty — large gap

    await checkAnomalies();

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips silence alert when already alerted within 2 hours (dedup)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 5 }] } as never)
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] } as never) // wasActive
      .mockResolvedValueOnce({ rows: [{ id: 55 }] } as never); // recentSilence — has row

    await checkAnomalies();

    // 4 queries — no INSERT
    expect(mockQuery).toHaveBeenCalledTimes(4);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkAnomalies — edge cases
// ---------------------------------------------------------------------------

describe("checkAnomalies — edge cases", () => {
  it("handles empty recentRates and empty baselines without errors", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await expect(checkAnomalies()).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("annualises a single 5-min event correctly (1 event → 12 events/hr)", async () => {
    // baseline=12 exactly → multiplier = 1 → no spike
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 1 }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 12 }] } as never);

    await checkAnomalies();

    // 1 * 12 / 12 = 1.0 — below MEDIUM threshold → no alert
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not trigger a spike when events_last_5min is 0", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: 0 }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 10 }] } as never);

    await checkAnomalies();

    // currentRate=0, multiplier=0 — no level set; agent is in recentRates so no silence either
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("handles NaN events_last_5min without alerting", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ agent_id: "a1", agent_name: "Agent One", events_last_5min: NaN }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 10 }] } as never);

    await checkAnomalies();

    // NaN * 12 = NaN; NaN >= 3 is false → no level
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not fire silence for agent inactive more than 1 hour (large gap recovery)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ agent_id: "a1", avg_hourly_events: 5 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never); // wasActive returns empty — gap > 1 hr

    await checkAnomalies();

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
