import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/init: RETIRED (transformate WI-4492, S5).
 * It once took a key as a Bearer and stored that raw key in the httpOnly mc_auth cookie for 7 days, so the owner
 * key lived in browsers. It has no positive path left: every request gets a 4xx with zero Set-Cookie, 410
 * {"error":"init_retired"} when a Bearer is presented (any value: no key is checked, so the answer tells nothing about
 * a key) and 401 with none. The path stays public and CSRF-exempt in proxy.ts so old clients reach this 410.
 * The owner signs in in the browser by a user session (/api/auth/login, or the magic link); the owner key stays a
 * server-to-server credential by the Bearer header.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const presented = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!presented) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "init_retired" }, { status: 410 });
}
