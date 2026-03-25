import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { NotionShell } from "@/components/mission-control/app-shell";
import { TenantProvider } from "@/components/mission-control/tenant-context";
import { ServiceWorkerRegistration } from "@/components/mission-control/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arkon",
  description: "Mobile-first monitoring dashboard for agents, systems, and live operations.",
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
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-deep text-text antialiased">
        <ServiceWorkerRegistration />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: "#0d0d1a", border: "1px solid #1a2a4a", color: "#e2e8f0" },
          }}
        />
        <TenantProvider><Suspense fallback={<div className="min-h-screen bg-[#050510]" />}><NotionShell>{children}</NotionShell></Suspense></TenantProvider>
      </body>
    </html>
  );
}
