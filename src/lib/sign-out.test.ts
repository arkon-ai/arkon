import { describe, it, expect, vi, afterEach } from "vitest";
import { signOut } from "./sign-out";

// Sign Out fails loud (FOLD 1, deck-main RULING 4174; transformate WI-3990): the caller may leave the page only when
// the server confirmed the logout, because only the server can expire the httpOnly mc_auth cookie.
describe("signOut", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(fetchImpl: () => Promise<Response>) {
    vi.stubGlobal("document", { cookie: "mc_csrf=abc" });
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("rejects on a non-2xx answer (HTTP 500)", async () => {
    stub(async () => new Response("{}", { status: 500 }));
    await expect(signOut()).rejects.toThrow();
  });

  it("rejects when the request itself fails (network)", async () => {
    stub(async () => { throw new TypeError("Failed to fetch"); });
    await expect(signOut()).rejects.toThrow();
  });

  it("resolves on 200 and sends the CSRF header (guard)", async () => {
    const fetchMock = stub(async () => new Response("{}", { status: 200 }));
    await expect(signOut()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: "POST",
      headers: { "x-csrf-token": "abc" },
    }));
  });
});
