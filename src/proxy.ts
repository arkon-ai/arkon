import { type NextRequest, NextResponse } from "next/server";
import { isNonBrowserCredential, resolveRequestCredential } from "@/lib/request-auth";

const AGENT_ROUTES = ["/api/ingest", "/api/purge", "/api/intake", "/api/health"];
const CSRF_PROTECTED_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const PUBLIC_PATHS = ["/login", "/setup", "/api/auth/init", "/api/auth/login", "/api/auth/magic-link", "/api/auth/verify-magic-link", "/api/health", "/api/intake", "/api/setup", "/docs/"];

function isDashboardApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function isAgentRoute(pathname: string): boolean {
  return AGENT_ROUTES.some((r) => pathname.startsWith(r));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();
  let credential: Awaited<ReturnType<typeof resolveRequestCredential>> | undefined;

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob:",
      "font-src 'self' https://fonts.gstatic.com data:",
      `connect-src 'self' wss: ws: https://cloudflareinsights.com ${process.env.ARKON_BASE_URL ?? ""}`.trim(),
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  if (
    !isPublicPath(pathname) &&
    !pathname.startsWith("/_next/") &&
    !pathname.startsWith("/favicon") &&
    !pathname.startsWith("/icon-") &&
    !pathname.startsWith("/manifest") &&
    !pathname.startsWith("/sw.js")
  ) {
    credential = await resolveRequestCredential(request);
    if (!credential) {
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

  if (!isDashboardApiRoute(pathname) || isAgentRoute(pathname)) {
    return response;
  }

  if (CSRF_PROTECTED_METHODS.includes(request.method)) {
    if (
      pathname === "/api/auth/init" ||
      pathname === "/api/auth/login" ||
      pathname === "/api/auth/magic-link" ||
      pathname === "/api/auth/verify-magic-link"
    ) return response;

    const csrfHeader = request.headers.get("x-csrf-token");
    const csrfCookie = request.cookies.get("mc_csrf")?.value;
    credential ??= await resolveRequestCredential(request);
    const hasValidatedApiCredential = !!credential && isNonBrowserCredential(credential);

    const csrfMatch = !!(csrfHeader && csrfCookie && decodeURIComponent(csrfHeader) === decodeURIComponent(csrfCookie));

    if (!hasValidatedApiCredential && !csrfMatch) {
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
