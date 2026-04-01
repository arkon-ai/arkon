"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  HelpCircle,
  X,
  BookOpen,
  Lightbulb,
  ListChecks,
  ChevronRight,
  Search,
} from "lucide-react";
import Link from "next/link";
import { helpContent, type HelpSection } from "./help-content";

/* ── Resolve help content for the current route ────────────────────────── */

function resolveHelp(pathname: string | null): HelpSection | null {
  if (!pathname) return null;
  // Exact match first
  if (helpContent[pathname]) return helpContent[pathname];
  // Try parent path (e.g., /agent/123 → /agents)
  const segments = pathname.split("/").filter(Boolean);
  while (segments.length > 0) {
    const candidate = `/${segments.join("/")}`;
    if (helpContent[candidate]) return helpContent[candidate];
    segments.pop();
  }
  return helpContent["/"] ?? null;
}

/* ── HelpPanel — slide-out from right ──────────────────────────────────── */

export function HelpPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((p) => !p), []);

  // ? key to toggle (only when not typing in an input)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "?" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName ?? "")) {
        // Don't trigger if modifier keys are held
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, toggle]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // Delay to avoid immediate close from the trigger click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const help = resolveHelp(pathname);

  return (
    <>
      {/* Help icon button in header */}
      <button
        type="button"
        onClick={toggle}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
        aria-label="Help"
        title="Help (press ?)"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/40" aria-hidden="true" />
      )}

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 z-[61] h-full w-[380px] max-w-[90vw] border-l border-[var(--border)]/50 bg-[var(--bg-primary)] shadow-[0_0_60px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--border)]/50 px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {help?.title ?? "Help"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-white/[0.05] hover:text-[var(--text-secondary)]"
            aria-label="Close help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-56px)] overflow-y-auto p-4">
          {help ? (
            <div className="space-y-5">
              {/* Description */}
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {help.description}
              </p>

              {/* Key Concepts */}
              {help.concepts && help.concepts.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--text-tertiary)]">
                    <Lightbulb className="h-3 w-3" />
                    Key Concepts
                  </h3>
                  <div className="space-y-2">
                    {help.concepts.map((c) => (
                      <div
                        key={c.term}
                        className="rounded-xl border border-[var(--border)]/60 bg-[var(--bg-surface)]/60 px-3 py-2.5"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {c.term}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          {c.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Common Tasks */}
              {help.tasks && help.tasks.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--text-tertiary)]">
                    <ListChecks className="h-3 w-3" />
                    Common Tasks
                  </h3>
                  <div className="space-y-1.5">
                    {help.tasks.map((t) => (
                      <div
                        key={t.label}
                        className="rounded-xl border border-[var(--border)]/40 px-3 py-2"
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          {t.label}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          {t.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Tips */}
              {help.tips && help.tips.length > 0 && (
                <section>
                  <h3 className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--text-tertiary)]">
                    <Lightbulb className="h-3 w-3" />
                    Tips
                  </h3>
                  <ul className="space-y-1.5">
                    {help.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-[11px] leading-relaxed text-[var(--text-secondary)]"
                      >
                        <span className="mt-0.5 text-[var(--accent)]">&bull;</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Footer links */}
              <div className="border-t border-[var(--border)]/50 pt-4">
                <Link
                  href="/help/glossary"
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                >
                  <Search className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  Search Glossary
                  <ChevronRight className="ml-auto h-3 w-3 text-[var(--text-tertiary)]" />
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No help content available for this page.
            </p>
          )}

          {/* Keyboard hint */}
          <div className="mt-6 rounded-xl border border-[var(--border)]/40 bg-[var(--bg-surface)]/40 px-3 py-2.5 text-center">
            <p className="text-[10px] text-[var(--text-tertiary)]">
              Press <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">?</kbd> to toggle help
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
