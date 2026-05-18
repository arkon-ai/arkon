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
    ];
  },
};

export default nextConfig;
