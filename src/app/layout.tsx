import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { NotionShell } from "@/components/mission-control/app-shell";
import { ServiceWorkerRegistration } from "@/components/mission-control/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arkon — AI Control Plane",
  description: "Monitor, govern, and manage your AI agent infrastructure. Best with OpenClaw/NemoClaw. Works with anything.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arkon",
  },
  icons: {
    icon: [
      { url: "/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: "/icon-192.svg",
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
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#05050f" />
      </head>
      <body className="bg-bg-deep text-text antialiased">
        <ServiceWorkerRegistration />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: "#0d0d1a", border: "1px solid #1a2a4a", color: "#e2e8f0" },
          }}
        />
        <Suspense fallback={<div className="min-h-screen bg-[#05050f]" />}><NotionShell>{children}</NotionShell></Suspense>
      </body>
    </html>
  );
}
