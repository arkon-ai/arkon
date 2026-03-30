"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutModal } from "@/components/ui/keyboard-shortcut-modal";

interface GlobalShortcutsProps {
  onOpenPalette: () => void;
  onOpenKill: () => void;
}

export function GlobalShortcuts({ onOpenPalette, onOpenKill }: GlobalShortcutsProps) {
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = useState(false);

  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);

  const shortcuts = useMemo(
    () => [
      {
        keys: "g+d",
        handler: () => router.push("/"),
        description: "Go to Dashboard",
        category: "Navigation",
      },
      {
        keys: "g+a",
        handler: () => router.push("/agents"),
        description: "Go to Agents",
        category: "Navigation",
      },
      {
        keys: "g+t",
        handler: () => router.push("/security"),
        description: "Go to ThreatGuard",
        category: "Navigation",
      },
      {
        keys: "g+c",
        handler: () => router.push("/costs"),
        description: "Go to Costs",
        category: "Navigation",
      },
      {
        keys: "g+w",
        handler: () => router.push("/workflows"),
        description: "Go to Workflows",
        category: "Navigation",
      },
      {
        keys: "g+i",
        handler: () => router.push("/infrastructure"),
        description: "Go to Infrastructure",
        category: "Navigation",
      },
      {
        keys: "g+s",
        handler: () => router.push("/settings"),
        description: "Go to Settings",
        category: "Navigation",
      },
      {
        keys: "/",
        handler: onOpenPalette,
        description: "Open command palette",
        category: "Actions",
      },
      {
        keys: "?",
        handler: toggleShortcuts,
        description: "Show keyboard shortcuts",
        category: "Actions",
      },
    ],
    [router, onOpenPalette, toggleShortcuts]
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <KeyboardShortcutModal
      open={showShortcuts}
      onClose={() => setShowShortcuts(false)}
    />
  );
}
