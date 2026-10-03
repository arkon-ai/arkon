import { describe, it, expect } from "vitest";
import { isUuid, parseNonNegativeInteger, parseSerialId } from "./_utils";

// transformate WI-3989: route ids and paging params that reached Postgres unchecked answered 500.
describe("parseSerialId", () => {
  it("accepts a positive int4 id as a string or a number", () => {
    expect(parseSerialId("42")).toBe(42);
    expect(parseSerialId(42)).toBe(42);
    expect(parseSerialId("2147483647")).toBe(2147483647);
  });

  it("rejects anything no SERIAL row can have", () => {
    for (const bad of ["", "0", "-1", "01", "1.5", "1 OR 1=1", "nonexistent-id", "00000000-0000-0000-0000-000000000000", "2147483648", null, undefined, {}]) {
      expect(parseSerialId(bad)).toBeNull();
    }
  });
});

describe("parseNonNegativeInteger", () => {
  it("clamps negatives to 0 and keeps the fallback for junk", () => {
    expect(parseNonNegativeInteger("-100", 0)).toBe(0);
    expect(parseNonNegativeInteger("-1", 50)).toBe(0);
    expect(parseNonNegativeInteger("abc", 50)).toBe(50);
    expect(parseNonNegativeInteger("20", 50)).toBe(20);
  });
});

describe("isUuid", () => {
  it("accepts a UUID and rejects ids no UUID column can hold", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    for (const bad of ["", null, undefined, "nonexistent-session-id", "'; DELETE FROM traces; --", "1"]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
