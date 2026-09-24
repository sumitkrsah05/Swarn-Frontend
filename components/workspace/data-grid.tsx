"use client";

/**
 * The data grid (docs/guide.md §2.6): virtualised, paged 500 rows at a time
 * from /api/data/datasets/{name}/rows; sort, search and filters run on the
 * server. 24px header, zebra rows, 12px cells, numbers right-aligned, a 56px
 * `#` column first. Source column headers are blue-tinted, derived ones
 * orange-tinted. The ⋮ menu opens the column popover (stats, sort, a filter
 * by type). Column headers are draggable into the chart editor (dnd-kit).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDraggable } from "@dnd-kit/core";
import { api, isDatasetGone, type ColumnKind, type ColumnStats, type DatasetColumn, type RowFilter } from "@/lib/api";
import {
  Button,
  EmptyNote,
  FilterIcon,
  IconButton,
  Input,
  Loading,
  MoreIcon,
  Popover,
  SortAscIcon,
  SortDescIcon,
  TableIcon,
  TypeBoolIcon,
  TypeDateIcon,
  TypeNumberIcon,
  TypeOtherIcon,
  TypeTextIcon,
} from "@/components/ui";

const PAGE = 500;
const ROW_H = 24;
const INDEX_W = 56;

export function kindIcon(kind: ColumnKind | undefined, size = 11): ReactNode {
  switch (kind) {
    case "number":
      return <TypeNumberIcon size={size} />;
    case "date":
    case "datetime":
      return <TypeDateIcon size={size} />;
    case "boolean":
      return <TypeBoolIcon size={size} />;
    case "string":
      return <TypeTextIcon size={size} />;
    default:
      return <TypeOtherIcon size={size} />;
  }
}

function fmtCell(v: unknown, kind: ColumnKind | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3 ? v.toPrecision(4) : v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (kind === "datetime" && typeof v === "string") return v.replace("T", " ").replace(/\.\d+$/, "");
  return String(v);
}

export interface DataGridProps {
  name: string;
  columns: DatasetColumn[];
  derived?: string[];
  q?: string;
  height?: number | string;
  onTotal?: (total: number) => void;
  onGone?: () => void;
  /** column headers become drag sources for the chart editor */
  draggable?: boolean;
  className?: string;
}

interface ColumnSort {
  column: string;
  desc: boolean;
}

function ColumnHeader({
  col,
  derived,
  sort,
  filtered,
  onCycleSort,
  onMenu,
  draggable,
}: {
  col: DatasetColumn;
  derived: boolean;
  sort: ColumnSort | null;
  filtered: boolean;
  onCycleSort: () => void;
  onMenu: (anchor: HTMLElement) => void;
  draggable: boolean;
}) {
  // the column NAME is the drag source (a 6px activation distance keeps plain
  // clicks sorting); the cell itself stays a plain container so the menu
  // button inside it is never nested in a role="button" element
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${col.name}`,
    data: { column: col.name, kind: col.kind },
    disabled: !draggable,
  });
  const sorted = sort?.column === col.name;
  const dragProps = draggable ? { ...attributes, ...listeners } : {};
  return (
    <div
      className={`group flex h-6 items-center gap-1 border-r border-b-2 px-1.5 text-11 font-medium ${
        derived ? "border-b-user bg-user-tint" : "border-b-accent bg-accent-tint"
      } ${isDragging ? "opacity-50" : ""}`}
      title={`${col.name} · ${col.kind}${derived ? " · derived column" : ""}${draggable ? " · drag into a chart channel" : ""}`}
    >
      <span className={`shrink-0 ${derived ? "text-user" : "text-accent"}`}>{kindIcon(col.kind)}</span>
      <button
        type="button"
        ref={setNodeRef}
        onClick={onCycleSort}
        className={`min-w-0 flex-1 truncate text-left text-fg hover:text-accent ${draggable ? "cursor-grab" : ""}`}
        title={draggable ? "Click to sort · drag into a chart channel" : "Click to sort"}
        {...dragProps}
        aria-label={`${col.name}: click to sort${draggable ? ", drag into a chart channel" : ""}`}
      >
        {col.name}
      </button>
      <span className={`shrink-0 ${sorted ? "text-accent" : "text-faint opacity-0 group-hover:opacity-100"}`} aria-hidden>
        {sorted && sort.desc ? <SortDescIcon size={11} /> : <SortAscIcon size={11} />}
      </span>
      {filtered && (
        <span className="shrink-0 text-accent" title="filtered">
          <FilterIcon size={10} />
        </span>
      )}
      <IconButton label={`Column menu for ${col.name}`} size={18} className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={(e) => onMenu(e.currentTarget)}>
        <MoreIcon size={12} />
      </IconButton>
    </div>
  );
}

function ColumnPopover({
  name,
  col,
  anchor,
  onClose,
  filter,
  sort,
  onApply,
}: {
  name: string;
  col: DatasetColumn;
  anchor: HTMLElement | null;
  onClose: () => void;
  filter: RowFilter | null;
  sort: ColumnSort | null;
  onApply: (filter: RowFilter | null, sort: ColumnSort | null) => void;
}) {
  const [stats, setStats] = useState<ColumnStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [min, setMin] = useState(filter?.op === "range" ? String(filter.min ?? "") : "");
  const [max, setMax] = useState(filter?.op === "range" ? String(filter.max ?? "") : "");
  const [text, setText] = useState(filter?.op === "contains" ? filter.text ?? "" : "");
  const [values, setValues] = useState<Set<string>>(new Set((filter?.op === "in" ? filter.values ?? [] : []).map(String)));
  const [localSort, setLocalSort] = useState<ColumnSort | null>(sort?.column === col.name ? sort : null);

  useEffect(() => {
    let cancelled = false;
    api
      .datasetColumn(name, col.name)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [name, col.name]);

  const numeric = col.kind === "number";
  const dateish = col.kind === "date" || col.kind === "datetime";
  const checklist = !numeric && !dateish && stats != null && stats.distinct <= 100;

  const apply = () => {
    let f: RowFilter | null = null;
    if (numeric || dateish) {
      if (min !== "" || max !== "") {
        f = { column: col.name, op: "range", min: min === "" ? null : numeric ? Number(min) : min, max: max === "" ? null : numeric ? Number(max) : max };
      }
    } else if (checklist) {
      if (values.size > 0) f = { column: col.name, op: "in", values: [...values].map((v) => (v === "__null__" ? null : v)) };
    } else if (text.trim()) {
      f = { column: col.name, op: "contains", text: text.trim() };
    }
    onApply(f, localSort);
    onClose();
  };

  return (
    <Popover anchor={anchor} open={!!anchor} onClose={onClose} placement="bottom-end" width={280} label={`Column ${col.name}`}>
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 font-mono text-12 font-medium text-fg">
          <span className="text-muted">{kindIcon(col.kind, 12)}</span>
          <span className="truncate">{col.name}</span>
          <span className="ml-auto text-10 font-normal text-faint">{col.dtype}</span>
        </div>
        <div className="mt-1 font-mono text-11 text-muted">
          {stats ? `${stats.rows.toLocaleString()} rows · ${stats.distinct.toLocaleString()} distinct · ${stats.blanks.toLocaleString()} blanks` : error ? <span className="text-err">{error}</span> : "loading…"}
        </div>
        {stats && (numeric || dateish) && (
          <div className="mt-0.5 font-mono text-10 text-faint">
            min {fmtCell(stats.min, col.kind)} · max {fmtCell(stats.max, col.kind)}
            {stats.mean != null && ` · mean ${fmtCell(stats.mean, col.kind)}`}
          </div>
        )}

        <div className="mt-2.5 text-10 font-bold tracking-[0.04em] text-faint uppercase">Sort</div>
        <div className="mt-1 flex gap-1">
          {(
            [
              ["none", "None"],
              ["asc", "Ascending"],
              ["desc", "Descending"],
            ] as const
          ).map(([k, label]) => {
            const active = k === "none" ? !localSort : localSort?.desc === (k === "desc");
            return (
              <button
                key={k}
                type="button"
                onClick={() => setLocalSort(k === "none" ? null : { column: col.name, desc: k === "desc" })}
                className={`rounded-chip border px-2 py-0.5 text-11 ${active ? "border-accent bg-accent-tint text-accent" : "border-edge text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 text-10 font-bold tracking-[0.04em] text-faint uppercase">Filter</div>
        {numeric || dateish ? (
          <div className="mt-1 flex items-center gap-1.5">
            <Input value={min} onChange={(e) => setMin(e.target.value)} placeholder="min" className="h-7 py-0 font-mono text-11" aria-label="Minimum" />
            <span className="text-faint">–</span>
            <Input value={max} onChange={(e) => setMax(e.target.value)} placeholder="max" className="h-7 py-0 font-mono text-11" aria-label="Maximum" />
          </div>
        ) : checklist ? (
          <div className="mt-1 max-h-44 overflow-y-auto rounded-chip border border-edge">
            {stats!.top.map((t) => {
              const key = t.value == null ? "__null__" : String(t.value);
              const on = values.has(key);
              return (
                <label key={key} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-11 hover:bg-hover">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setValues((s) => {
                        const n = new Set(s);
                        if (on) n.delete(key);
                        else n.add(key);
                        return n;
                      })
                    }
                    className="accent-accent"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-fg">{t.value == null ? <span className="text-faint">(blank)</span> : String(t.value)}</span>
                  <span className="font-mono text-10 text-faint">{t.count.toLocaleString()}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="contains…" className="mt-1 h-7 py-0 text-11" aria-label="Contains" />
        )}

        <div className="mt-3 flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onApply(null, localSort);
              onClose();
            }}
          >
            Clear filter
          </Button>
          <Button size="sm" variant="primary" onClick={apply}>
            Apply
          </Button>
        </div>
      </div>
    </Popover>
  );
}

export function DataGrid({ name, columns, derived = [], q = "", height = "100%", onTotal, onGone, draggable = false, className = "" }: DataGridProps) {
  "use no memo"; // @tanstack/react-virtual is not React Compiler compatible yet
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const [filters, setFilters] = useState<RowFilter[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [pages, setPages] = useState<Map<number, unknown[][]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [menu, setMenu] = useState<{ col: DatasetColumn; anchor: HTMLElement } | null>(null);
  const inflight = useRef(new Set<number>());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const derivedSet = useMemo(() => new Set(derived), [derived]);
  const kinds = useMemo(() => new Map(columns.map((c) => [c.name, c.kind])), [columns]);
  const queryKey = JSON.stringify({ name, sort, filters, q });

  // reset the cache when the query changes
  useEffect(() => {
    setPages(new Map());
    setTotal(null);
    setError(null);
    setGone(false);
    inflight.current.clear();
    scrollRef.current?.scrollTo({ top: 0 });
  }, [queryKey]);

  const fetchPage = useCallback(
    (page: number) => {
      if (inflight.current.has(page)) return;
      inflight.current.add(page);
      api
        .datasetRows(name, { offset: page * PAGE, limit: PAGE, sort: sort?.column, desc: sort?.desc, q, filters })
        .then((res) => {
          setPages((prev) => {
            const next = new Map(prev);
            next.set(page, res.rows);
            return next;
          });
          setTotal(res.total);
          onTotal?.(res.total);
          setError(null);
        })
        .catch((e) => {
          if (isDatasetGone(e)) {
            setGone(true);
            onGone?.();
          } else setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => inflight.current.delete(page));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey, onTotal, onGone],
  );

  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const rowCount = total ?? 0;
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });
  const items = virtualizer.getVirtualItems();

  // fetch the pages the visible range needs
  useEffect(() => {
    if (!items.length) return;
    const first = Math.floor(items[0].index / PAGE);
    const last = Math.floor(items[items.length - 1].index / PAGE);
    for (let p = first; p <= last; p++) if (!pages.has(p)) fetchPage(p);
  }, [items, pages, fetchPage]);

  const rowAt = (i: number): unknown[] | undefined => pages.get(Math.floor(i / PAGE))?.[i % PAGE];

  const cycleSort = (col: string) =>
    setSort((s) => (s?.column !== col ? { column: col, desc: false } : s.desc ? null : { column: col, desc: true }));

  const colWidth = (c: DatasetColumn) => (c.kind === "number" ? 120 : c.kind === "boolean" ? 90 : 160);
  const template = `${INDEX_W}px ${columns.map((c) => `${colWidth(c)}px`).join(" ")}`;
  const totalWidth = INDEX_W + columns.reduce((n, c) => n + colWidth(c), 0);

  if (gone) {
    return (
      <EmptyNote
        icon={<TableIcon size={24} />}
        title="This dataset is not in memory"
        hint="The server may have restarted. Re-run the step that created it and the grid comes back."
        className={className}
      />
    );
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`} style={{ height }}>
      {error && <div className="border-b border-err/40 bg-err-tint px-2 py-1 text-11 text-err">{error}</div>}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" style={{ contain: "strict" }}>
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          {/* header */}
          <div className="sticky top-0 z-[2] grid bg-panel" style={{ gridTemplateColumns: template }}>
            <div className="flex h-6 items-center justify-end border-r border-b-2 border-edge bg-raised px-1.5 font-mono text-10 text-faint">#</div>
            {columns.map((c) => (
              <ColumnHeader
                key={c.name}
                col={c}
                derived={derivedSet.has(c.name)}
                sort={sort}
                filtered={filters.some((f) => f.column === c.name)}
                onCycleSort={() => cycleSort(c.name)}
                onMenu={(anchor) => setMenu({ col: c, anchor })}
                draggable={draggable}
              />
            ))}
          </div>
          {/* rows */}
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((it) => {
              const row = rowAt(it.index);
              return (
                <div
                  key={it.index}
                  className={`absolute left-0 grid w-full ${it.index % 2 ? "bg-grey-tint" : ""}`}
                  style={{ top: it.start, height: ROW_H, gridTemplateColumns: template }}
                >
                  <div className="flex items-center justify-end border-r border-edge-soft px-1.5 font-mono text-10 text-faint">{(it.index + 1).toLocaleString()}</div>
                  {columns.map((c, ci) => {
                    const kind = kinds.get(c.name);
                    const v = row?.[ci];
                    return (
                      <div
                        key={c.name}
                        className={`flex items-center truncate border-r border-edge-soft px-1.5 text-12 ${kind === "number" ? "justify-end font-mono tabular-nums" : ""} ${v == null && row ? "text-faint" : "text-fg"}`}
                        title={row ? fmtCell(v, kind) : undefined}
                      >
                        {row ? (v == null ? "∅" : fmtCell(v, kind)) : <span className="h-3 w-3/5 animate-pulse rounded bg-raised motion-reduce:animate-none" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {total === 0 && (
            <div className="px-3 py-6 text-center text-12 text-muted">{q || filters.length ? "No rows match the search or filters." : "This dataset has no rows."}</div>
          )}
          {total === null && !error && <Loading label="Loading rows…" />}
        </div>
      </div>
      {menu && (
        <ColumnPopover
          name={name}
          col={menu.col}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          filter={filters.find((f) => f.column === menu.col.name) ?? null}
          sort={sort}
          onApply={(f, s) => {
            setFilters((prev) => {
              const rest = prev.filter((x) => x.column !== menu.col.name);
              return f ? [...rest, f] : rest;
            });
            if (s || sort?.column === menu.col.name) setSort(s);
          }}
        />
      )}
    </div>
  );
}
