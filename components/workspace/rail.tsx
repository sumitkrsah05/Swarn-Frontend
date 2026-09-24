"use client";

/**
 * The left rail (docs/guide.md §7.2): 40px of icons that open a docked panel
 * (default 280px, resizable 240–450px, width in localStorage). Pinned, the
 * panel pushes the workspace aside; unpinned, it overlays and closes on
 * click-away. Under 1024px it always overlays. Clicking the active icon
 * collapses the panel.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, uploadFiles, type DatasetInfo, type UploadBatch } from "@/lib/api";
import { formatBytes, formatTime } from "@/lib/format";
import { useToast } from "@/components/toast";
import { Markdown } from "@/components/markdown";
import { WorkspacesList } from "./workspaces-dialog";
import { useWorkspaceUi } from "./context";
import { kindIcon } from "./data-grid";
import {
  BulbIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DatabaseIcon,
  EmptyNote,
  IconButton,
  LayersIcon,
  PinIcon,
  PlusIcon,
  Popover,
  RefreshIcon,
  SectionLabel,
  TableIcon,
  UploadIcon,
} from "@/components/ui";

export type RailPanel = "add" | "datasets" | "workspaces" | "knowledge";

const WIDTH_KEY = "swarn:railPanelWidth";
const PIN_KEY = "swarn:railPinned";
const MIN_W = 240;
const MAX_W = 450;

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return v >= MIN_W && v <= MAX_W ? v : fallback;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------- add data

function AddDataPanel() {
  const ui = useWorkspaceUi();
  const toast = useToast();
  const [pct, setPct] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploads = useQuery({ queryKey: ["uploads"], queryFn: api.listUploads, staleTime: 15_000 });

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setPct(0);
    try {
      const res = await uploadFiles(files, setPct);
      ui.requestAttach({ data_dir: res.data_dir, label: res.relative_dir, files: res.files });
      toast("success", `Attached ${res.files.length} file(s) to the next prompt`);
      void uploads.refetch();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`cursor-pointer rounded-panel border border-dashed px-3 py-6 text-center transition-colors ${drag ? "border-accent bg-accent-tint" : "border-edge hover:border-faint"}`}
      >
        {pct !== null ? (
          <div className="mx-auto max-w-[12rem]">
            <div className="mb-1.5 text-12 text-muted">Uploading… {Math.round(pct * 100)}%</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
          </div>
        ) : (
          <>
            <UploadIcon size={20} className="mx-auto mb-1.5 text-faint" />
            <div className="text-12 text-fg">Drop CSV / Excel / Parquet files</div>
            <div className="mt-0.5 text-11 text-faint">They attach to your next prompt</div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <SectionLabel>Reuse an upload</SectionLabel>
          <IconButton label="Refresh uploads" size={22} onClick={() => uploads.refetch()}>
            <RefreshIcon size={12} />
          </IconButton>
        </div>
        {uploads.isPending && <p className="text-11 text-muted">Loading…</p>}
        {uploads.isError && <p className="text-11 text-err">{(uploads.error as Error).message}</p>}
        {uploads.data && uploads.data.uploads.length === 0 && <p className="text-11 text-muted">No previous uploads.</p>}
        <ul className="space-y-0.5">
          {(uploads.data?.uploads ?? []).map((u: UploadBatch) => (
            <li key={u.batch}>
              <button
                type="button"
                onClick={() => {
                  ui.requestAttach({ data_dir: u.data_dir, label: u.relative_dir, files: u.files.map((f) => f.name) });
                  toast("success", `Attached ${u.relative_dir} to the next prompt`);
                }}
                className="w-full rounded-card px-2 py-1.5 text-left hover:bg-hover"
              >
                <div className="truncate font-mono text-11 text-fg">{u.files.map((f) => f.name).join(", ")}</div>
                <div className="truncate text-10 text-faint">
                  {formatTime(u.created)} · {formatBytes(u.files.reduce((s, f) => s + f.size, 0))}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- datasets

function DatasetNode({ ds, depth, kids }: { ds: DatasetInfo; depth: number; kids: DatasetInfo[] }) {
  const ui = useWorkspaceUi();
  const [open, setOpen] = useState(true);
  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const producer = ui.ws.turns.find((t) => t.artifacts.datasets.some((d) => d.name === ds.name));
  const focused = ui.focus?.kind === "dataset" && ui.focus.name === ds.name;

  const enter = (el: HTMLElement) => {
    setHoverAnchor(el);
    timer.current = setTimeout(() => setHover(true), 450);
  };
  const leave = () => {
    if (timer.current) clearTimeout(timer.current);
    setHover(false);
  };

  return (
    <li>
      <div
        className={`group flex h-6 items-center gap-1 rounded-chip pr-1 ${focused ? "bg-accent-tint text-accent" : "text-fg hover:bg-hover"}`}
        style={{ paddingLeft: 4 + depth * 12 }}
        onMouseEnter={(e) => enter(e.currentTarget)}
        onMouseLeave={leave}
      >
        {kids.length > 0 ? (
          <IconButton label={open ? "Collapse" : "Expand"} size={16} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDownIcon size={10} /> : <ChevronRightIcon size={10} />}
          </IconButton>
        ) : (
          <span className="inline-block w-4" />
        )}
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/x-swarn-dataset", ds.name);
            e.dataTransfer.setData("text/plain", `@${ds.name}`);
          }}
          onClick={() => ui.focusRef({ kind: "dataset", turnId: producer?.id ?? null, name: ds.name })}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title="Click to open on the canvas · drag onto the composer to @-mention"
        >
          <TableIcon size={12} className={ds.parents.length ? "text-user" : "text-accent"} />
          <span className="truncate text-12">{ds.name}</span>
          <span className="ml-auto shrink-0 font-mono text-10 text-faint">
            {ds.rows.toLocaleString()} × {ds.cols}
          </span>
        </button>
        <IconButton label={`Mention @${ds.name} in the composer`} size={18} className="reveal" onClick={() => ui.requestMention(ds.name)}>
          <span className="font-mono text-11">@</span>
        </IconButton>
      </div>
      <Popover anchor={hoverAnchor} open={hover} onClose={() => setHover(false)} placement="right-start" width={260} role="presentation" initialFocus={false}>
        <div className="p-2">
          <div className="mb-1 font-mono text-11 text-fg">{ds.name}</div>
          <div className="mb-1.5 text-10 text-faint">
            {ds.rows.toLocaleString()} rows · {ds.cols} columns{ds.tool ? ` · ${ds.tool}` : ""}
          </div>
          <div className="flex flex-wrap gap-1">
            {ds.columns.slice(0, 40).map((c) => (
              <span key={c.name} className={`inline-flex items-center gap-1 rounded-chip border px-1 font-mono text-10 ${ds.derived_columns.includes(c.name) ? "border-user/40 bg-user-tint text-user" : "border-edge text-muted"}`}>
                {kindIcon(c.kind, 9)}
                {c.name}
              </span>
            ))}
            {ds.columns.length > 40 && <span className="text-10 text-faint">+{ds.columns.length - 40}</span>}
          </div>
        </div>
      </Popover>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <DatasetTree key={k.name} ds={k} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function DatasetTree({ ds, depth }: { ds: DatasetInfo; depth: number }) {
  const ui = useWorkspaceUi();
  const kids = ui.datasets.filter((d) => d.parents[0] === ds.name);
  return <DatasetNode ds={ds} depth={depth} kids={kids} />;
}

function DatasetsPanel() {
  const ui = useWorkspaceUi();
  const names = new Set(ui.datasets.map((d) => d.name));
  const rootsList = ui.datasets.filter((d) => d.parents.length === 0 || !names.has(d.parents[0]));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <SectionLabel>Data sources</SectionLabel>
        <IconButton label="Refresh datasets" size={22} onClick={ui.refetchDatasets}>
          <RefreshIcon size={12} />
        </IconButton>
      </div>
      {ui.datasetsError && <p className="text-11 text-err">{ui.datasetsError}</p>}
      {ui.datasetsLoading && !ui.datasetsError && <p className="text-11 text-muted">Loading…</p>}
      {!ui.datasetsLoading && !ui.datasetsError && ui.datasets.length === 0 && (
        <EmptyNote icon={<DatabaseIcon size={22} />} title="Nothing loaded yet" hint="Datasets appear here as the agent loads and derives them. The registry lives in server memory." className="py-6" />
      )}
      <ul className="space-y-px">
        {rootsList.map((d) => (
          <DatasetTree key={d.name} ds={d} depth={0} />
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------- knowledge

function KnowledgePanel() {
  const pb = useQuery({ queryKey: ["playbook"], queryFn: api.getPlaybook, staleTime: 60_000 });
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <SectionLabel>Knowledge</SectionLabel>
        <Link href="/knowledge" className="text-11 text-accent hover:underline">
          open page
        </Link>
      </div>
      {pb.isPending && <p className="text-11 text-muted">Loading…</p>}
      {pb.isError && <p className="text-11 text-err">{(pb.error as Error).message}</p>}
      {pb.data && (pb.data.playbook.trim() === "" ? <p className="text-11 text-muted">The playbook is empty. It fills in as runs complete.</p> : <Markdown>{pb.data.playbook}</Markdown>)}
    </div>
  );
}

// ------------------------------------------------------------------ rail

const PANELS: { id: RailPanel; label: string; icon: ReactNode; primary?: boolean }[] = [
  { id: "add", label: "Add data", icon: <PlusIcon size={18} />, primary: true },
  { id: "datasets", label: "Datasets", icon: <DatabaseIcon size={17} /> },
  { id: "workspaces", label: "Workspaces", icon: <LayersIcon size={17} /> },
  { id: "knowledge", label: "Knowledge", icon: <BulbIcon size={17} /> },
];

export function Rail({ forceOverlay }: { forceOverlay: boolean }) {
  const [active, setActive] = useState<RailPanel | null>(null);
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 280 : readNumber(WIDTH_KEY, 280)));
  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(PIN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const overlay = forceOverlay || !pinned;

  useEffect(() => {
    if (!active || !overlay) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || railRef.current?.contains(t)) return;
      if ((t as HTMLElement).closest?.("[role='dialog'],[role='menu'],[role='listbox'],[role='presentation']")) return;
      setActive(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active, overlay]);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startW = width;
      const move = (ev: PointerEvent) => {
        if (!dragging.current) return;
        setWidth(Math.max(MIN_W, Math.min(MAX_W, startW + ev.clientX - startX)));
      };
      const up = () => {
        dragging.current = false;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setWidth((w) => {
          try {
            localStorage.setItem(WIDTH_KEY, String(w));
          } catch {
            /* ignore */
          }
          return w;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [width],
  );

  const togglePin = () => {
    setPinned((p) => {
      try {
        localStorage.setItem(PIN_KEY, p ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !p;
    });
  };

  const panelTitle = PANELS.find((p) => p.id === active)?.label;

  return (
    <div className="relative flex h-full shrink-0">
      <div ref={railRef} className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-edge bg-panel py-1.5" role="toolbar" aria-label="Panels">
        {PANELS.map((p) => (
          <IconButton
            key={p.id}
            label={p.label}
            size={32}
            active={active === p.id}
            tone={p.primary ? "primary" : "default"}
            onClick={() => setActive((a) => (a === p.id ? null : p.id))}
            aria-expanded={active === p.id}
          >
            {p.icon}
          </IconButton>
        ))}
      </div>
      {active && (
        <div
          ref={panelRef}
          className={`flex h-full flex-col border-r border-edge bg-panel ${overlay ? "absolute top-0 left-10 z-[30] shadow-pop" : "relative"}`}
          style={{ width }}
          role="region"
          aria-label={panelTitle}
        >
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-edge px-2">
            <SectionLabel as="h2" className="flex-1 truncate">
              {panelTitle}
            </SectionLabel>
            {!forceOverlay && (
              <IconButton label={pinned ? "Unpin the panel (overlay)" : "Pin the panel"} size={24} active={pinned} onClick={togglePin}>
                <PinIcon size={13} />
              </IconButton>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {active === "add" && <AddDataPanel />}
            {active === "datasets" && <DatasetsPanel />}
            {active === "workspaces" && <WorkspacesList compact />}
            {active === "knowledge" && <KnowledgePanel />}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the panel"
            onPointerDown={startResize}
            className="absolute top-0 -right-0.5 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
          />
        </div>
      )}
    </div>
  );
}
