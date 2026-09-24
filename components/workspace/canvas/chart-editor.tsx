"use client";

/**
 * Quick chart and Edit chart (docs/guide.md §7.7): the chart gallery and the
 * encoding popover. Client-side Vega-Lite, no model call.
 *
 * The popover is non-modal, 280px wide, 10px radius, anchored to "Edit
 * chart": a chart-type grid, one row per channel (x, y, color, size, column,
 * row) with an 84px label button and a field chip or an empty "field"
 * autocomplete, per-channel options (type, sort, aggregate), and a footer
 * link to the Vega Editor. Field chips can be dragged from the grid's
 * column headers into channels (dnd-kit); dropping a chip onto another swaps.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DatasetColumn } from "@/lib/api";
import {
  CHANNELS,
  CHART_GALLERY,
  chartName,
  channelsFor,
  openInVegaEditor,
  type Aggregate,
  type Channel,
  type ChartConfig,
  type Encoding,
  type FieldType,
  type SortOrder,
  type VegaChartType,
} from "@/lib/vega";
import { kindIcon } from "../data-grid";
import { CloseIcon, ExternalIcon, IconButton, Popover, TrashIcon } from "@/components/ui";

/** 30×30 monochrome line-art icons, drawn here. */
export function GalleryIcon({ type, size = 30 }: { type: VegaChartType; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 30 30", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (type) {
    case "scatter":
      return (
        <svg {...common}>
          <path d="M5 25V5M5 25h20" />
          <circle cx="11" cy="18" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="20" cy="15" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="23" cy="8" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="13" cy="8" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "bar":
      return (
        <svg {...common}>
          <path d="M5 25h20M8 25V13h4v12M14 25V7h4v18M20 25v-9h4v9" />
        </svg>
      );
    case "grouped-bar":
      return (
        <svg {...common}>
          <path d="M5 25h20M7 25V15h3v10M11 25v-6h3v6M17 25V9h3v16M21 25V13h3v12" />
        </svg>
      );
    case "stacked-bar":
      return (
        <svg {...common}>
          <path d="M5 25h20M9 25V8h5v17M9 17h5M17 25V12h5v13M17 19h5" />
        </svg>
      );
    case "histogram":
      return (
        <svg {...common}>
          <path d="M5 25h20M6 25v-5h4v5M10 25V13h4v12M14 25V6h4v19M18 25v-9h4v9M22 25v-4h3v4" />
        </svg>
      );
    case "boxplot":
      return (
        <svg {...common}>
          <path d="M15 4v5M15 21v5M10 4h10M10 26h10" />
          <rect x="9" y="9" width="12" height="12" rx="1" />
          <path d="M9 15h12" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <path d="M5 25h20M5 21l6-8 5 4 5-9 4 5" />
        </svg>
      );
    case "area":
      return (
        <svg {...common}>
          <path d="M5 25h20" />
          <path d="M5 22l6-8 5 4 5-9 4 5v11H5Z" />
        </svg>
      );
    case "heatmap":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="20" height="20" rx="1.5" />
          <path d="M5 12h20M5 18h20M12 5v20M18 5v20" />
          <rect x="12" y="12" width="6" height="6" fill="currentColor" stroke="none" opacity="0.5" />
        </svg>
      );
  }
}

export function ChartGallery({ value, onPick, compact }: { value?: VegaChartType; onPick: (t: VegaChartType) => void; compact?: boolean }) {
  return (
    <div className="space-y-2">
      {CHART_GALLERY.map((g) => (
        <div key={g.category}>
          <div className="mb-1 text-10 font-bold tracking-[0.04em] text-faint uppercase">{g.category}</div>
          <div className="flex flex-wrap gap-1">
            {g.items.map((it) => (
              <button
                key={it.type}
                type="button"
                onClick={() => onPick(it.type)}
                aria-pressed={value === it.type}
                className={`flex ${compact ? "h-12 w-14 flex-col" : "h-16 w-20 flex-col"} items-center justify-center gap-0.5 rounded-card border text-muted transition-colors hover:border-accent hover:text-accent ${
                  value === it.type ? "border-accent bg-accent-tint text-accent" : "border-edge"
                }`}
                title={it.name}
              >
                <GalleryIcon type={it.type} size={compact ? 22 : 30} />
                <span className="text-10">{it.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChartGalleryPopover({ anchor, open, onClose, onPick }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; onPick: (t: VegaChartType) => void }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="top-start" width={300} label="Quick chart">
      <div className="p-3">
        <div className="mb-2 text-12 font-medium text-fg">Quick chart</div>
        <ChartGallery
          onPick={(t) => {
            onPick(t);
            onClose();
          }}
        />
      </div>
    </Popover>
  );
}

// ------------------------------------------------------------ field chips

export function FieldChip({ field, kind, channel, onRemove }: { field: string; kind: DatasetColumn["kind"] | undefined; channel: Channel; onRemove?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${channel}`, data: { column: field, kind, fromChannel: channel } });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`inline-flex h-6 max-w-full cursor-grab items-center gap-1 rounded-chip border border-accent/40 bg-accent-tint px-1.5 font-mono text-11 text-accent ${isDragging ? "opacity-50" : ""}`}
      title={`${field} (drag to another channel)`}
    >
      {kindIcon(kind)}
      <span className="truncate">{field}</span>
      {onRemove && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} aria-label={`Remove ${field} from ${channel}`} className="text-accent/70 hover:text-err">
          <CloseIcon size={10} />
        </button>
      )}
    </span>
  );
}

function ChannelRow({
  channel,
  encoding,
  columns,
  onChange,
  dragging,
}: {
  channel: Channel;
  encoding: Encoding | undefined;
  columns: DatasetColumn[];
  onChange: (e: Encoding | undefined) => void;
  dragging: { kind?: string } | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `channel:${channel}`, data: { channel } });
  const [optsAnchor, setOptsAnchor] = useState<HTMLElement | null>(null);
  const [optsOpen, setOptsOpen] = useState(false);
  const [fieldAnchor, setFieldAnchor] = useState<HTMLElement | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [query, setQuery] = useState("");
  const col = columns.find((c) => c.name === encoding?.field);
  const compatible = !!dragging;
  const bg = isOver ? "bg-accent-tint" : compatible ? "bg-ask-tint" : "";
  const list = columns.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  const set = (patch: Partial<Encoding>) => onChange({ ...(encoding ?? {}), ...patch });
  const hasContent = !!encoding?.field || (encoding?.aggregate && encoding.aggregate !== "none");
  const summary = [
    encoding?.type && encoding.type !== "auto" ? encoding.type[0].toUpperCase() : null,
    encoding?.aggregate && encoding.aggregate !== "none" ? encoding.aggregate : null,
    encoding?.sort && encoding.sort !== "none" ? (encoding.sort === "ascending" ? "↑" : "↓") : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} className={`flex items-center gap-1.5 rounded-card px-1 py-1 transition-colors ${bg}`}>
      <button
        type="button"
        ref={setOptsAnchor}
        onClick={() => setOptsOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={optsOpen}
        className="flex h-6 w-[84px] shrink-0 items-center justify-between rounded-chip border border-edge bg-panel px-1.5 text-11 text-fg hover:border-accent"
        title="Channel options: type, sort, aggregate"
      >
        <span className="font-medium">{channel}</span>
        <span className="truncate font-mono text-10 text-faint">{summary}</span>
      </button>
      <div className="min-w-0 flex-1">
        {hasContent && encoding?.field ? (
          <FieldChip field={encoding.field} kind={col?.kind} channel={channel} onRemove={() => onChange(undefined)} />
        ) : hasContent ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-chip border border-edge bg-raised px-1.5 font-mono text-11 text-muted">
            {encoding?.aggregate}
            <button type="button" onClick={() => onChange(undefined)} aria-label={`Clear ${channel}`} className="text-muted hover:text-err">
              <CloseIcon size={10} />
            </button>
          </span>
        ) : (
          <button
            type="button"
            ref={setFieldAnchor}
            onClick={() => setFieldOpen(true)}
            className="h-6 w-full rounded-chip border border-dashed border-edge px-1.5 text-left text-11 text-faint hover:border-accent hover:text-accent"
          >
            field
          </button>
        )}
      </div>
      <FieldPicker anchor={fieldAnchor} open={fieldOpen} onClose={() => setFieldOpen(false)} list={list} query={query} setQuery={setQuery} onPick={(name) => set({ field: name, type: "auto" })} />
      <ChannelOptions anchor={optsAnchor} open={optsOpen} onClose={() => setOptsOpen(false)} encoding={encoding} set={set} />
    </div>
  );
}

function FieldPicker({ anchor, open, onClose, list, query, setQuery, onPick }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; list: DatasetColumn[]; query: string; setQuery: (q: string) => void; onPick: (name: string) => void }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-start" width={220} role="listbox" label="Choose a field">
      <div className="p-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search columns…"
          aria-label="Search columns"
          className="mb-1 h-7 w-full rounded-chip border border-edge bg-panel px-2 text-11 text-fg focus:border-accent focus:outline-none"
        />
        <ul className="max-h-48 overflow-y-auto">
          {list.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => {
                  onPick(c.name);
                  onClose();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left font-mono text-11 text-fg hover:bg-hover"
              >
                <span className="text-muted">{kindIcon(c.kind)}</span>
                <span className="truncate">{c.name}</span>
                <span className="ml-auto text-10 text-faint">{c.kind}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="px-2 py-1 text-11 text-faint">no column matches</li>}
        </ul>
      </div>
    </Popover>
  );
}

function OptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-16 text-10 font-bold tracking-[0.04em] text-faint uppercase">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Opt<T extends string>({ value, current, onPick }: { value: T; current: T; onPick: (v: T) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`rounded-chip border px-1.5 py-0.5 text-10 ${current === value ? "border-accent bg-accent-tint text-accent" : "border-edge text-muted hover:text-fg"}`}
    >
      {value}
    </button>
  );
}

function ChannelOptions({ anchor, open, onClose, encoding, set }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; encoding: Encoding | undefined; set: (p: Partial<Encoding>) => void }) {
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-start" width={260} label="Channel options">
      <div className="p-2">
        <OptRow label="type">
          {(["auto", "quantitative", "nominal", "temporal"] as FieldType[]).map((t) => (
            <Opt key={t} value={t} current={encoding?.type ?? "auto"} onPick={(v) => set({ type: v })} />
          ))}
        </OptRow>
        <OptRow label="sort">
          {(["none", "ascending", "descending"] as SortOrder[]).map((t) => (
            <Opt key={t} value={t} current={encoding?.sort ?? "none"} onPick={(v) => set({ sort: v })} />
          ))}
        </OptRow>
        <OptRow label="aggregate">
          {(["none", "count", "sum", "mean"] as Aggregate[]).map((t) => (
            <Opt key={t} value={t} current={encoding?.aggregate ?? "none"} onPick={(v) => set({ aggregate: v })} />
          ))}
        </OptRow>
      </div>
    </Popover>
  );
}

// ------------------------------------------------------------- the popover

export function ChartEditorPopover({
  anchor,
  open,
  onClose,
  columns,
  config,
  onChange,
  onDelete,
  spec,
  dragging,
  title,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  columns: DatasetColumn[];
  config: ChartConfig;
  onChange: (c: ChartConfig) => void;
  onDelete?: () => void;
  spec: Record<string, unknown>;
  dragging: { kind?: string } | null;
  title?: string;
}) {
  const channels = useMemo(() => channelsFor(config.type), [config.type]);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement="bottom-end" width={280} label="Edit chart" initialFocus={false} className="rounded-pop">
      <div className="p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-12 font-medium text-fg">{title ?? "Edit chart"}</span>
          <span className="font-mono text-10 text-faint">{chartName(config.type)}</span>
        </div>
        <ChartGallery compact value={config.type} onPick={(type) => onChange({ ...config, type })} />
        <div className="mt-2 space-y-0.5 border-t border-edge pt-2">
          {channels.map((ch) => (
            <ChannelRow
              key={ch}
              channel={ch}
              encoding={config.encodings[ch]}
              columns={columns}
              dragging={dragging}
              onChange={(e) => onChange({ ...config, encodings: { ...config.encodings, [ch]: e } })}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-edge pt-2">
          <button type="button" onClick={() => openInVegaEditor(spec)} className="inline-flex items-center gap-1 text-11 text-accent hover:underline">
            <ExternalIcon size={11} />
            Open in Vega Editor
          </button>
          {onDelete &&
            (armed ? (
              <span className="flex items-center gap-1 text-11 text-err">
                Delete this chart?
                <button type="button" onClick={onDelete} className="rounded-chip border border-err/40 px-1.5 py-0.5 hover:bg-err-tint">
                  yes
                </button>
                <button type="button" onClick={() => setArmed(false)} className="rounded-chip border border-edge px-1.5 py-0.5 text-muted">
                  no
                </button>
              </span>
            ) : (
              <IconButton label="Delete this chart" size={22} tone="danger" onClick={() => setArmed(true)}>
                <TrashIcon size={12} />
              </IconButton>
            ))}
        </div>
      </div>
    </Popover>
  );
}

/** Apply a dnd-kit drop to a config: move / swap fields between channels. */
export function applyDrop(config: ChartConfig, data: { column: string; kind?: string; fromChannel?: Channel }, target: Channel): ChartConfig {
  const enc = { ...config.encodings };
  const from = data.fromChannel;
  if (from && from !== target) {
    const a = enc[from];
    const b = enc[target];
    enc[target] = { ...(a ?? {}), field: data.column };
    enc[from] = b?.field ? b : undefined;
  } else if (!from) {
    enc[target] = { ...(enc[target] ?? {}), field: data.column, type: "auto" };
  }
  for (const ch of CHANNELS) if (enc[ch] === undefined) delete enc[ch];
  return { ...config, encodings: enc };
}
