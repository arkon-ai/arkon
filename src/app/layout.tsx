import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Toaster } from "sonner";
import { NotionShell } from "@/components/mission-control/app-shell";
import { ServiceWorkerRegistration } from "@/components/mission-control/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arkon — AI Governance Platform",
  description: "AI Governance Platform. Monitor your agents. Detect threats. Track costs. Build workflows. One dashboard.",
  metadataBase: new URL("https://arkonhq.com"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arkon",
  },
  openGraph: {
    title: "Arkon — AI Governance Platform",
    description: "Monitor your agents. Detect threats. Track costs. Build workflows.",
    url: "https://arkonhq.com",
    siteName: "Arkon",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@arkonhq",
    title: "Arkon — AI Governance Platform",
    description: "Monitor your agents. Detect threats. Track costs. Build workflows.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
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
        <meta name="theme-color" content="#050510" />
      </head>
      <body className="bg-bg-deep text-text antialiased">
        <ServiceWorkerRegistration />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: "#0d0d1a", border: "1px solid #1a2a4a", color: "#e2e8f0" },
          }}
        />
        <Suspense fallback={<div className="min-h-screen bg-[#050510]" />}><NotionShell>{children}</NotionShell></Suspense>
      </body>
    </html>
  );
}
