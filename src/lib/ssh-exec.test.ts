import { describe, it, expect } from "vitest";
import { isValidIp, isValidUnixUser, isValidPort } from "./ssh-exec";

describe("isValidIp", () => {
  it("accepts valid IPv4 and IPv6 literals", () => {
    expect(isValidIp("100.90.212.53")).toBe(true);
    expect(isValidIp("127.0.0.1")).toBe(true);
    expect(isValidIp("fd7a:115c:a1e0::1")).toBe(true);
  });
  it("rejects shell-injection payloads and malformed input", () => {
    expect(isValidIp("1.2.3.4; rm -rf /")).toBe(false);
    expect(isValidIp("$(curl evil)")).toBe(false);
    expect(isValidIp("")).toBe(false);
    expect(isValidIp("not-an-ip")).toBe(false);
    expect(isValidIp(undefined)).toBe(false);
    expect(isValidIp(123)).toBe(false);
  });
});

describe("isValidUnixUser", () => {
  it("accepts POSIX-style user names", () => {
    expect(isValidUnixUser("brynn")).toBe(true);
    expect(isValidUnixUser("root")).toBe(true);
    expect(isValidUnixUser("_svc-1")).toBe(true);
  });
  it("rejects injection payloads, leading digits/caps, and empties", () => {
    expect(isValidUnixUser("brynn; reboot")).toBe(false);
    expect(isValidUnixUser("a b")).toBe(false);
    expect(isValidUnixUser("Brynn")).toBe(false); // uppercase
    expect(isValidUnixUser("1abc")).toBe(false); // leading digit
    expect(isValidUnixUser("$(id)")).toBe(false);
    expect(isValidUnixUser("")).toBe(false);
    expect(isValidUnixUser(null)).toBe(false);
  });
});

describe("isValidPort", () => {
  it("accepts in-range integer ports", () => {
    expect(isValidPort(22)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });
  it("rejects out-of-range, non-integer, and non-number ports", () => {
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(70000)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(22.5)).toBe(false);
    expect(isValidPort("22" as unknown as number)).toBe(false);
    expect(isValidPort(NaN)).toBe(false);
  });
});
