/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import ClientShell from "./client-shell";
import { ServiceWorkerRegistration } from "@/components/mission-control/service-worker-registration";
import { ThemeProvider } from "@/components/mission-control/theme-provider";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0C", // --void; <meta theme-color> needs a literal color, not a CSS var (WI-999)
};

export const metadata: Metadata = {
  title: "Arkon — AI Workforce Platform",
  description: "Build, govern, and run your AI workforce.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arkon",
  },
  icons: {
    icon: [
      // Modern SVG favicon — canonical Quarn A glyph (WI-1033)
      { url: "/arkon-glyph.svg", type: "image/svg+xml" },
      // .ico fallback for browsers without SVG-favicon support
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Geist — display/UI, Geist Mono — numerals/code, Urbanist — wordmark only */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Urbanist:wght@800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg-deep text-text antialiased" suppressHydrationWarning>
        <ThemeProvider>
        <ServiceWorkerRegistration />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            },
          }}
        />
        <ClientShell>{children}</ClientShell>
      </ThemeProvider>
      </body>
    </html>
  );
}
