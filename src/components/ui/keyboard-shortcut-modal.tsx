"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { getRegisteredShortcuts } from "@/hooks/use-keyboard-shortcuts";

interface KeyboardShortcutModalProps {
  open: boolean;
  onClose: () => void;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded border border-[#2E2E3A] bg-[#0A0A0C] px-1.5 py-0.5 text-[11px] font-medium text-[#8888A0]">
      {children}
    </kbd>
  );
}

function formatKeys(keys: string) {
  const parts = keys.split("+");
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((k, i) => (
        <span key={k} className="inline-flex items-center gap-1">
          {i > 0 ? <span className="text-[#555566] text-[10px]">then</span> : null}
          <Kbd>{k === "/" ? "/" : k === "?" ? "?" : k.toUpperCase()}</Kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcutModal({ open, onClose }: KeyboardShortcutModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const shortcuts = getRegisteredShortcuts();

  // Group by category
  const groups: Record<string, typeof shortcuts> = {};
  for (const s of shortcuts) {
    const cat = s.category ?? "General";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close shortcuts"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[#2E2E3A] bg-[#1A1A22] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2E2E3A]/50 px-5 py-3">
          <h2
            className="text-base font-bold text-[#E4E4ED]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#555566] transition hover:bg-white/[0.04] hover:text-[#E4E4ED]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {Object.entries(groups).map(([category, items]) => (
            <div key={category} className="mb-5 last:mb-0">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#555566]">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((s) => (
                  <div
                    key={s.keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-[13px] text-[#8888A0]">
                      {s.description}
                    </span>
                    {formatKeys(s.keys)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-[#2E2E3A]/50 px-5 py-2.5 text-center text-[11px] text-[#555566]">
          Press <Kbd>?</Kbd> to toggle this dialog
        </div>
      </div>
    </div>
  );
}
