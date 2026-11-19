import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { isUuid, parseNonNegativeInteger, parseSerialId, validateAdmin } from "./_utils";

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

/* validateAdmin compares the owner key by the Bearer header only (transformate WI-4495, S7): the raw owner key a
   pre-U5 browser holds in mc_auth (init set it for 7 days) resolves nothing. Fixed FAKE values only. */
describe("validateAdmin: the owner key by Bearer only (transformate WI-4495)", () => {
  const FAKE_OWNER_KEY = "fake-u5-owner-key-0000000000000000";
  function req(opts: { bearer?: string; cookies?: Record<string, string> }) {
    const r = new NextRequest("https://arkon.test/api/x", opts.bearer ? { headers: { authorization: `Bearer ${opts.bearer}` } } : undefined);
    for (const [k, v] of Object.entries(opts.cookies ?? {})) r.cookies.set(k, v);
    return r;
  }
  beforeEach(() => {
    process.env.MC_ADMIN_TOKEN = FAKE_OWNER_KEY;
  });

  it("T1b the fake owner key in the mc_auth cookie is refused", () => {
    expect(validateAdmin(req({ cookies: { mc_auth: FAKE_OWNER_KEY } }))).toBe(false);
  });

  // GREEN at the base by design (S10, positive control).
  it("T1b the same fake owner key as a Bearer is admitted", () => {
    expect(validateAdmin(req({ bearer: FAKE_OWNER_KEY }))).toBe(true);
  });

  // GREEN at the base by design (S10, named): Bearer precedence; a junk Bearer never falls through to the cookie.
  it("a junk Bearer with the owner key in the cookie is refused", () => {
    expect(validateAdmin(req({ bearer: "junk", cookies: { mc_auth: FAKE_OWNER_KEY } }))).toBe(false);
  });
});
