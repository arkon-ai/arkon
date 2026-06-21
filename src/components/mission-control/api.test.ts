import { describe, expect, it } from "vitest";

/** Mirrors the stale-response guard used by useLivePollingFetch.refresh */
function shouldApplyFetchResult(reqId: number, latestReqId: number, mounted: boolean): boolean {
  return mounted && reqId === latestReqId;
}

describe("useLivePollingFetch stale-response guard", () => {
  it("applies only the latest in-flight request result", () => {
    expect(shouldApplyFetchResult(1, 2, true)).toBe(false);
    expect(shouldApplyFetchResult(2, 2, true)).toBe(true);
  });

  it("drops results after unmount", () => {
    expect(shouldApplyFetchResult(3, 3, false)).toBe(false);
  });
});