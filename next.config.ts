import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  async redirects() {
    return [
      // /tools/* → /integrations/* permanent redirect (308 — preserves method
      // and body, signals to crawlers + clients that the new path is canonical).
      // Brand-package §F3: "MCP servers IS Integrations" — the user-facing
      // route is unified under /integrations. Old /tools/* URLs remain
      // operational via this redirect during the migration window.
      {
        source: "/tools",
        destination: "/integrations",
        permanent: true,
      },
      {
        source: "/tools/:path*",
        destination: "/integrations/:path*",
        permanent: true,
      },
      // WI-391: /integrations/mcp and /integrations/mcp-gateway → /integrations.
      // The MCP servers control point IS the Integrations page now (Brynn Q1).
      // Config-level redirect (not page-level permanentRedirect) because the
      // app's ClientShell wraps children client-side, which intercepts the
      // NEXT_REDIRECT throw and renders the error digest as HTML at 200
      // instead of propagating to the framework redirect handler.
      {
        source: "/integrations/mcp",
        destination: "/integrations",
        permanent: true,
      },
      {
        source: "/integrations/mcp-gateway",
        destination: "/integrations",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
