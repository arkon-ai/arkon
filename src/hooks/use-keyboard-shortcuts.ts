"use client";

import { useEffect, useCallback, useRef } from "react";

type ShortcutHandler = () => void;

interface ShortcutDef {
  /** Key combo like "g+d", "?", "/", "escape" */
  keys: string;
  handler: ShortcutHandler;
  /** Description for the shortcuts modal */
  description: string;
  /** Category for grouping in the shortcuts modal */
  category?: string;
}

// Global registry so the modal can read all registered shortcuts
const shortcutRegistry: ShortcutDef[] = [];

export function getRegisteredShortcuts(): ShortcutDef[] {
  return [...shortcutRegistry];
}

/**
 * Hook for registering keyboard shortcuts.
 * Supports single keys ("?", "/", "n") and two-key sequences ("g+d", "g+a").
 * Won't fire when user is typing in an input/textarea/contenteditable.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  const pendingKey = useRef<string | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Register shortcuts
  useEffect(() => {
    for (const s of shortcuts) {
      const existing = shortcutRegistry.findIndex((r) => r.keys === s.keys);
      if (existing >= 0) {
        shortcutRegistry[existing] = s;
      } else {
        shortcutRegistry.push(s);
      }
    }
    return () => {
      for (const s of shortcuts) {
        const idx = shortcutRegistry.findIndex((r) => r.keys === s.keys);
        if (idx >= 0) shortcutRegistry.splice(idx, 1);
      }
    };
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (e.target as HTMLElement).isContentEditable;
      if (isEditable) return;

      const key = e.key.toLowerCase();

      // Check for two-key sequences (e.g., "g+d")
      if (pendingKey.current) {
        const combo = `${pendingKey.current}+${key}`;
        pendingKey.current = null;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);

        const match = shortcuts.find((s) => s.keys === combo);
        if (match) {
          e.preventDefault();
          match.handler();
          return;
        }
      }

      // Check if this key starts a sequence
      const isSequenceStart = shortcuts.some((s) => s.keys.startsWith(`${key}+`));
      if (isSequenceStart) {
        pendingKey.current = key;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
        pendingTimer.current = setTimeout(() => {
          pendingKey.current = null;
        }, 500); // 500ms to press second key
        return;
      }

      // Single key shortcuts
      const match = shortcuts.find((s) => s.keys === key);
      if (match) {
        e.preventDefault();
        match.handler();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
