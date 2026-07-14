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
  themeColor: "#070A0E", // --hull; <meta theme-color> needs a literal color, not a CSS var (WI-999)
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
      // Modern SVG favicon — canonical Ion A glyph (P6, transformate WI-1904)
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
