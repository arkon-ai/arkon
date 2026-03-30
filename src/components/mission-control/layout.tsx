import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { NotionShell } from "@/components/mission-control/app-shell";
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
            style: { background: "#1A1A22", border: "1px solid #2E2E3A", color: "#E4E4ED" },
          }}
        />
        <Suspense fallback={<div className="min-h-screen bg-[#0A0A0C]" />}><NotionShell>{children}</NotionShell></Suspense>
      </body>
    </html>
  );
}
