"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NotionShell } from "@/components/mission-control/app-shell";

/**
 * Defers NotionShell rendering to after hydration via a mounted guard.
 * Server renders the placeholder div, client renders the same placeholder
 * during hydration (mounted=false), then useEffect flips mounted=true
 * and the real shell renders — zero hydration mismatch.
 */
export default function ClientShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return <div className="min-h-screen" style={{ background: "#0A0A0C" }} />;
  }

  return <NotionShell>{children}</NotionShell>;
}
