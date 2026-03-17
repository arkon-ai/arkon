import { type NextRequest, NextResponse } from "next/server";

// Routes that are server-to-server only (exempt from CSRF and auth redirect)
const AGENT_ROUTES = ["/api/ingest", "/api/purge", "/api/intake", "/api/health"];
const CSRF_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const PUBLIC_PATHS = ["/login", "/api/auth/init", "/api/health", "/api/intake", "/docs/"];

function isDashboardApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isAgentRoute(pathname: string): boolean {
  return AGENT_ROUTES.some((r) => pathname.startsWith(r));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ── Security headers on ALL responses ──────────────────────────────────
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      `connect-src 'self' wss: ws: ${process.env.ARKON_BASE_URL ?? ""}`.trim(),
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  // SEC-1/UX-1: Redirect unauthenticated users to /login
  // Skip for public paths, static assets, and agent API routes
  if (
    !isPublicPath(pathname) &&
    !pathname.startsWith("/_next/") &&
    !pathname.startsWith("/favicon") &&
    !pathname.startsWith("/icon-") &&
    !pathname.startsWith("/manifest") &&
    !pathname.startsWith("/sw.js")
  ) {
    const hasAuth = request.cookies.has("mc_auth") || !!request.headers.get("authorization");
    if (!hasAuth) {
      // API routes return 401, page routes redirect to login
      if (pathname.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
  }

  // Skip CSRF check for non-API, agent routes, and public paths
  if (!isDashboardApiRoute(pathname) || isAgentRoute(pathname)) {
    return response;
  }

  // ── CSRF check for browser mutations ───────────────────────────────────
  if (CSRF_PROTECTED_METHODS.includes(request.method)) {
    // Auth init endpoint is exempt (bootstraps the cookie)
    if (pathname === "/api/auth/init") return response;

    const csrfHeader = request.headers.get("x-csrf-token");
    const csrfCookie = request.cookies.get("mc_csrf")?.value;
    // Bearer token = server-to-server (exempt from CSRF)
    const hasBearerAuth = !!request.headers.get("authorization");

    const csrfMatch = !!(csrfHeader && csrfCookie && decodeURIComponent(csrfHeader) === decodeURIComponent(csrfCookie));

    if (!hasBearerAuth && !csrfMatch) {
      return new NextResponse(JSON.stringify({ error: "CSRF validation failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)"],
};
