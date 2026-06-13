"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

/**
 * AgentsFilterPopover — Tenant + Model multiselect for the Agents Roster.
 *
 * Anchored to the PageHeader "Filter" button via an `absolute right-0 top-full`
 * panel inside a `relative` wrapper. Click-outside + Escape close. Used by
 * AgentsContent for transformate WI-392 / PR-7.
 *
 * Filtering happens in the parent (AgentsContent.filteredRoster); this
 * component is purely UI for selection state.
 */

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export function AgentsFilterPopover({
  open,
  onClose,
  tenantOptions,
  modelOptions,
  selectedTenants,
  selectedModels,
  onTenantToggle,
  onModelToggle,
  onClearAll,
}: {
  open: boolean;
  onClose: () => void;
  tenantOptions: FilterOption[];
  modelOptions: FilterOption[];
  selectedTenants: Set<string>;
  selectedModels: Set<string>;
  onTenantToggle: (value: string) => void;
  onModelToggle: (value: string) => void;
  onClearAll: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Outside click closes (deferred to skip the same click that opened it)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const totalSelected = selectedTenants.size + selectedModels.size;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-popover)]"
      role="dialog"
      aria-label="Filter agents"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Filter
        </h3>
        {totalSelected > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            Clear all ({totalSelected})
          </button>
        ) : null}
      </div>

      <FilterGroup
        label="Tenant"
        options={tenantOptions}
        selected={selectedTenants}
        onToggle={onTenantToggle}
      />

      <div className="my-2 h-px bg-[var(--border)]" />

      <FilterGroup
        label="Model"
        options={modelOptions}
        selected={selectedModels}
        onToggle={onModelToggle}
      />
    </div>
  );
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </div>
      {options.length === 0 ? (
        <div className="px-1 py-1 text-xs text-[var(--text-tertiary)]">No values</div>
      ) : (
        <div className="max-h-40 space-y-0.5 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggle(opt.value)}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? "border-[var(--text-primary)] bg-[var(--text-primary)]"
                        : "border-[var(--border)]"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="h-2.5 w-2.5 text-[var(--bg-primary)]" />
                    ) : null}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </span>
                {opt.count != null ? (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {opt.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
