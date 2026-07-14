"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { NotionShell } from "@/components/mission-control/app-shell";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function ClientShell({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  if (!hydrated) {
    return <div className="min-h-screen" style={{ background: "var(--hull)" }} />;
  }

  return <NotionShell>{children}</NotionShell>;
}
