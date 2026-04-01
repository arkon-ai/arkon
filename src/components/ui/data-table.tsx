"use client";

import {
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  CheckSquare,
  Square,
  MinusSquare,
  Columns3,
} from "lucide-react";

/* ─── Types ───────────────────────────────────────────── */

export interface ColumnDef<T> {
  id: string;
  header: string;
  /** Accessor function to get cell value from row */
  accessor: (row: T) => ReactNode;
  /** Raw value for sorting (defaults to accessor) */
  sortValue?: (row: T) => string | number;
  /** Right-align (for numbers) */
  align?: "left" | "right";
  /** Monospace font for this column */
  mono?: boolean;
  /** Width: "auto", specific px, or fr-like string */
  width?: string;
  /** Can this column be hidden */
  hideable?: boolean;
  /** Default visible */
  defaultVisible?: boolean;
  /** Enable search highlighting for this column */
  searchable?: boolean;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Unique key for each row */
  rowKey: (row: T) => string;
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Enable row selection */
  selectable?: boolean;
  /** Callback for bulk actions when rows are selected */
  onSelectionChange?: (selectedKeys: string[]) => void;
  /** Render bulk action toolbar */
  bulkActions?: (selectedKeys: string[], clearSelection: () => void) => ReactNode;
  /** Placeholder for empty state */
  emptyState?: ReactNode;
  /** Enable search */
  searchable?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Row density: compact=40px, normal=48px, relaxed=56px */
  density?: "compact" | "normal" | "relaxed";
  /** Sticky header */
  stickyHeader?: boolean;
  /** Max rows before "Load More" */
  pageSize?: number;
  /** Additional className for wrapper */
  className?: string;
}

type SortState = { column: string; direction: "asc" | "desc" } | null;

const densityMap = {
  compact: "h-10",
  normal: "h-12",
  relaxed: "h-14",
};

/* ─── Component ───────────────────────────────────────── */

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  selectable = false,
  onSelectionChange,
  bulkActions,
  emptyState,
  searchable = false,
  searchPlaceholder = "Search...",
  density = "normal",
  stickyHeader = true,
  pageSize = 50,
  className = "",
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    const hidden = new Set<string>();
    for (const col of columns) {
      if (col.defaultVisible === false) hidden.add(col.id);
    }
    return hidden;
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.id)),
    [columns, hiddenColumns]
  );

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (!col.searchable) return false;
        const val = col.accessor(row);
        return String(val ?? "").toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.column);
    if (!col) return filtered;
    const getValue = col.sortValue ?? ((row: T) => String(col.accessor(row) ?? ""));
    return [...filtered].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sort.direction === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  // Paginate
  const displayed = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount]
  );

  const handleSort = useCallback(
    (colId: string) => {
      setSort((prev) => {
        if (prev?.column === colId) {
          return prev.direction === "asc"
            ? { column: colId, direction: "desc" }
            : null;
        }
        return { column: colId, direction: "asc" };
      });
    },
    []
  );

  const toggleRow = useCallback(
    (key: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange]
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === displayed.length) {
        onSelectionChange?.([]);
        return new Set();
      }
      const all = new Set(displayed.map((r) => rowKey(r)));
      onSelectionChange?.(Array.from(all));
      return all;
    });
  }, [displayed, rowKey, onSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const toggleColumn = useCallback((colId: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  }, []);

  const allSelected = displayed.length > 0 && selected.size === displayed.length;
  const someSelected = selected.size > 0 && !allSelected;
  const rowHeight = densityMap[density];

  return (
    <div className={`rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] ${className}`}>
      {/* Toolbar */}
      {(searchable || columns.some((c) => c.hideable)) ? (
        <div className="flex items-center gap-2 border-b border-[var(--border)]/50 px-4 py-2.5">
          {searchable ? (
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setVisibleCount(pageSize); }}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 pl-8 pr-8 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]/40"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : <div className="flex-1" />}

          {/* Column picker */}
          {columns.some((c) => c.hideable) ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </button>
              {showColumnPicker ? (
                <div className="absolute right-0 top-10 z-30 min-w-[180px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-2 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
                  {columns.filter((c) => c.hideable).map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => toggleColumn(col.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                    >
                      {hiddenColumns.has(col.id) ? (
                        <Square className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                      ) : (
                        <CheckSquare className="h-3.5 w-3.5 text-[var(--accent)]" />
                      )}
                      {col.header}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bulk action bar */}
      {selected.size > 0 && bulkActions ? (
        <div className="flex items-center gap-3 border-b border-[var(--accent)]/20 bg-[rgba(0,212,126,0.04)] px-4 py-2">
          <span className="text-[12px] font-medium text-[var(--accent)]">
            {selected.size} selected
          </span>
          <div className="flex-1">{bulkActions(Array.from(selected), clearSelection)}</div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-[var(--text-tertiary)] transition hover:text-[var(--text-secondary)]"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr
              className={`border-b border-[var(--border)]/50 ${
                stickyHeader ? "sticky top-0 z-10 bg-[var(--bg-surface)]" : ""
              }`}
            >
              {selectable ? (
                <th className="w-10 px-3 py-2.5">
                  <button type="button" onClick={toggleAll} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-[var(--accent)]" />
                    ) : someSelected ? (
                      <MinusSquare className="h-4 w-4 text-[var(--accent)]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
              ) : null}
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-tertiary)] ${
                    col.align === "right" ? "text-right" : "text-left"
                  } cursor-pointer select-none transition hover:text-[var(--text-secondary)]`}
                  style={{ width: col.width }}
                  onClick={() => handleSort(col.id)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sort?.column === col.id ? (
                      sort.direction === "asc" ? (
                        <ChevronUp className="h-3 w-3 text-[var(--accent)]" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-[var(--accent)]" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center"
                >
                  {emptyState ?? (
                    <p className="text-sm text-[var(--text-tertiary)]">No data</p>
                  )}
                </td>
              </tr>
            ) : (
              displayed.map((row) => {
                const key = rowKey(row);
                const isSelected = selected.has(key);
                return (
                  <tr
                    key={key}
                    className={`${rowHeight} border-b border-[var(--border)]/30 transition ${
                      isSelected
                        ? "bg-[rgba(0,212,126,0.04)]"
                        : "hover:bg-white/[0.015]"
                    } ${onRowClick ? "cursor-pointer" : ""}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable ? (
                      <td className="w-10 px-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(key);
                          }}
                          className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[var(--accent)]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    ) : null}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        className={`px-4 py-0 text-[13px] text-[var(--text-primary)] ${
                          col.align === "right" ? "text-right" : "text-left"
                        } ${col.mono ? "font-mono" : ""}`}
                      >
                        {col.accessor(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {sorted.length > visibleCount ? (
        <div className="border-t border-[var(--border)]/50 px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + pageSize)}
            className="text-[12px] font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
          >
            Load more ({visibleCount} of {sorted.length})
          </button>
        </div>
      ) : sorted.length > 0 ? (
        <div className="border-t border-[var(--border)]/50 px-4 py-2 text-center text-[11px] text-[var(--text-tertiary)]">
          Showing {sorted.length} of {data.length}{search ? " (filtered)" : ""}
        </div>
      ) : null}
    </div>
  );
}
