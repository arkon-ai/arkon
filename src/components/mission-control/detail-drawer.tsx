"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { X } from "lucide-react";

/* ── DetailDrawer — reusable right-side slide-out panel ──────────────────── */

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  width?: number; // px, default 480
}

export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  width = 480,
}: DetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    },
    [open, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-label={title}
        style={{ width: `${width}px` }}
        className={`fixed right-0 top-0 z-[71] flex h-full max-w-[92vw] flex-col border-l border-[var(--border)] bg-[var(--bg-surface)] shadow-[0_0_60px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="shrink-0 text-[var(--accent)]">{icon}</span>}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {title}
              </h2>
              {subtitle && (
                <p className="truncate text-[11px] text-[var(--text-tertiary)]">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-white/[0.05] hover:text-[var(--text-secondary)]"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </>
  );
}
