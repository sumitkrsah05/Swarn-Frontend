"use client";

/**
 * Files (docs/guide.md §8.4): a two-pane browser of the agent workspace.
 * Left: a lazily expanded tree. Right: the preview — images inline, md /
 * html in the document column, CSVs in the data grid when a registry dataset
 * of the same name exists (otherwise the first 200 lines as text), other
 * text files as text, anything else as a download. `?path=` opens a
 * directory or previews a file (the target of the old /workspace route).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, workspaceFileUrl, type WorkspaceEntry } from "@/lib/api";
import { formatBytes, isImagePath } from "@/lib/format";
import { DocumentColumn } from "@/components/document-column";
import { DataGrid } from "@/components/workspace/data-grid";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  EmptyNote,
  ExternalIcon,
  FileIcon,
  FolderIcon,
  IconButton,
  ImageIcon,
  Loading,
  RefreshIcon,
  SectionLabel,
  TableIcon,
} from "@/components/ui";

const TEXT_EXT = /\.(txt|json|jsonl|py|log|yaml|yml|toml|ini|cfg|sh|js|ts|tsv|sql)$/i;
const MAX_LINES = 200;

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

function parentsOf(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

function fileKind(path: string): "image" | "md" | "html" | "csv" | "text" | "other" {
  const p = path.toLowerCase();
  if (isImagePath(p)) return "image";
  if (p.endsWith(".md")) return "md";
  if (p.endsWith(".html") || p.endsWith(".htm")) return "html";
  if (p.endsWith(".csv")) return "csv";
  if (TEXT_EXT.test(p)) return "text";
  return "other";
}

// ----------------------------------------------------------------- tree

function DirNode({
  path,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  path: string;
  depth: number;
  expanded: Set<string>;
  selected: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const open = expanded.has(path);
  const listing = useQuery({ queryKey: ["workspace", "dir", path], queryFn: () => api.listWorkspace(path), enabled: open, staleTime: 15_000 });
  const entries = useMemo(
    () => (listing.data ? [...listing.data.entries].sort((a, b) => (a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1)) : []),
    [listing.data],
  );
  return (
    <>
      {open && listing.isPending && (
        <div className="flex h-6 items-center text-11 text-faint" style={{ paddingLeft: 8 + depth * 12 }}>
          loading…
        </div>
      )}
      {open && listing.isError && (
        <div className="flex h-6 items-center truncate text-11 text-err" style={{ paddingLeft: 8 + depth * 12 }} title={(listing.error as Error).message}>
          {(listing.error as Error).message}
        </div>
      )}
      {open && listing.data && entries.length === 0 && (
        <div className="flex h-6 items-center text-11 text-faint" style={{ paddingLeft: 8 + depth * 12 }}>
          empty
        </div>
      )}
      {open &&
        entries.map((e: WorkspaceEntry) => {
          const full = joinPath(path, e.name);
          if (e.is_dir) {
            const isOpen = expanded.has(full);
            return (
              <div key={full}>
                <button
                  type="button"
                  onClick={() => onToggle(full)}
                  aria-expanded={isOpen}
                  className="flex h-6 w-full items-center gap-1 rounded-chip pr-1 text-left text-12 text-fg hover:bg-hover"
                  style={{ paddingLeft: 4 + depth * 12 }}
                >
                  <span className="shrink-0 text-faint">{isOpen ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />}</span>
                  <FolderIcon size={13} className="shrink-0 text-accent" />
                  <span className="truncate">{e.name}</span>
                </button>
                <DirNode path={full} depth={depth + 1} expanded={expanded} selected={selected} onToggle={onToggle} onSelect={onSelect} />
              </div>
            );
          }
          const active = selected === full;
          const image = isImagePath(e.name);
          return (
            <button
              key={full}
              type="button"
              onClick={() => onSelect(full)}
              aria-current={active ? "true" : undefined}
              className={`flex h-6 w-full items-center gap-1 rounded-chip pr-1 text-left text-12 ${active ? "bg-accent-tint text-accent" : "text-fg hover:bg-hover"}`}
              style={{ paddingLeft: 4 + depth * 12 + 15 }}
              title={full}
            >
              <span className={`shrink-0 ${active ? "text-accent" : "text-faint"}`}>
                {image ? <ImageIcon size={13} /> : e.name.toLowerCase().endsWith(".csv") ? <TableIcon size={13} /> : <FileIcon size={13} />}
              </span>
              <span className="truncate">{e.name}</span>
              <span className="ml-auto shrink-0 font-mono text-10 text-faint">{e.size == null ? "" : formatBytes(e.size)}</span>
            </button>
          );
        })}
    </>
  );
}

// -------------------------------------------------------------- preview

function TextPreview({ path, note }: { path: string; note?: string }) {
  const q = useQuery({ queryKey: ["workspace", "text", path], queryFn: () => api.getWorkspaceText(path), staleTime: 30_000 });
  if (q.isPending) return <Loading label="Loading file…" />;
  if (q.isError) return <EmptyNote icon={<FileIcon size={22} />} title="The file could not be loaded" hint={(q.error as Error).message} />;
  const lines = q.data.split("\n");
  const shown = lines.slice(0, MAX_LINES).join("\n");
  return (
    <div className="h-full overflow-auto p-4">
      {note && <p className="mb-2 text-11 text-muted">{note}</p>}
      <pre className="rounded-panel border border-edge bg-code-bg p-3 font-mono text-12 leading-relaxed whitespace-pre text-fg">{shown}</pre>
      {lines.length > MAX_LINES && (
        <p className="mt-2 font-mono text-10 text-faint">
          first {MAX_LINES} of {lines.length.toLocaleString()} lines · <a href={workspaceFileUrl(path)} className="text-accent hover:underline">download the whole file</a>
        </p>
      )}
    </div>
  );
}

function MarkdownPreview({ path }: { path: string }) {
  const q = useQuery({ queryKey: ["workspace", "text", path], queryFn: () => api.getWorkspaceText(path), staleTime: 30_000 });
  if (q.isPending) return <Loading label="Loading document…" />;
  if (q.isError) return <EmptyNote icon={<FileIcon size={22} />} title="The document could not be loaded" hint={(q.error as Error).message} />;
  return (
    <div className="h-full overflow-y-auto">
      <DocumentColumn title={path} markdown={q.data} />
    </div>
  );
}

function CsvPreview({ path }: { path: string }) {
  const datasets = useQuery({ queryKey: ["data", "datasets"], queryFn: api.listDatasets, staleTime: 15_000 });
  const stem = path.split("/").pop()?.replace(/\.csv$/i, "") ?? "";
  const info = datasets.data?.datasets.find((d) => d.name === stem);
  if (datasets.isPending) return <Loading label="Checking the dataset registry…" />;
  if (info) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-edge px-4 py-2 font-mono text-11 text-muted">
          registry dataset <span className="text-fg">{info.name}</span> · {info.rows.toLocaleString()} rows · {info.cols} columns
          {info.derived_columns.length > 0 && <span className="text-user"> · {info.derived_columns.length} derived</span>}
        </div>
        <div className="min-h-0 flex-1">
          <DataGrid name={info.name} columns={info.columns} derived={info.derived_columns} height="100%" />
        </div>
      </div>
    );
  }
  return <TextPreview path={path} note={datasets.isError ? `The dataset registry could not be read (${(datasets.error as Error).message}); showing the file text.` : `No loaded dataset is named '${stem}', so this is the raw file text.`} />;
}

function Preview({ path }: { path: string | null }) {
  if (!path) {
    return <EmptyNote icon={<FolderIcon size={24} />} title="Pick a file" hint="Images, reports and tables preview here. Everything else downloads." className="h-full" />;
  }
  const kind = fileKind(path);
  const name = path.split("/").pop() ?? path;
  const url = workspaceFileUrl(path);
  const bar = (
    <div className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-1.5">
      <span className="min-w-0 flex-1 truncate font-mono text-12 text-fg" title={path}>
        {path}
      </span>
      <a href={url} target="_blank" rel="noreferrer" title="Open in a new tab" aria-label="Open in a new tab" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg">
        <ExternalIcon size={13} />
      </a>
      <a href={url} download={name} title="Download" aria-label="Download" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg">
        <DownloadIcon size={13} />
      </a>
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {bar}
      <div className="min-h-0 flex-1">
        {kind === "image" && (
          <div className="flex h-full items-center justify-center overflow-auto p-4">
            {/* workspace output is arbitrary agent-produced media — plain <img> */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={name} className="max-h-full max-w-full rounded-panel border border-edge bg-white animate-fade-in" />
          </div>
        )}
        {kind === "md" && <MarkdownPreview path={path} />}
        {kind === "html" && (
          <div className="h-full overflow-y-auto">
            <DocumentColumn title={path} htmlSrc={url} />
          </div>
        )}
        {kind === "csv" && <CsvPreview key={path} path={path} />}
        {kind === "text" && <TextPreview path={path} />}
        {kind === "other" && (
          <EmptyNote
            icon={<FileIcon size={24} />}
            title="No preview for this file type"
            hint={name}
            action={
              <a href={url} download={name} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-12 font-medium text-on-accent hover:opacity-90">
                <DownloadIcon size={13} />
                Download
              </a>
            }
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- page

function FilesBrowser() {
  const search = useSearchParams();
  const router = useRouter();
  const requested = search.get("path") ?? "";
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [selected, setSelected] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const root = useQuery({ queryKey: ["workspace", "dir", ""], queryFn: () => api.listWorkspace(""), staleTime: 15_000 });

  // resolve ?path=: a directory opens in the tree, a file is previewed
  useEffect(() => {
    if (!requested || requested === resolved) return;
    let cancelled = false;
    const parents = parentsOf(requested);
    api
      .listWorkspace(requested)
      .then(() => {
        if (cancelled) return;
        setExpanded((s) => new Set([...s, ...parents, requested]));
        setResolved(requested);
      })
      .catch(() => {
        if (cancelled) return;
        setExpanded((s) => new Set([...s, ...parents]));
        setSelected(requested);
        setResolved(requested);
      });
    return () => {
      cancelled = true;
    };
  }, [requested, resolved]);

  const toggle = useCallback((path: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }, []);

  const select = useCallback(
    (path: string) => {
      setSelected(path);
      setResolved(path);
      router.replace(`/files?path=${encodeURIComponent(path)}`);
    },
    [router],
  );

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-edge bg-panel" aria-label="Workspace files">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-edge px-2">
          <SectionLabel as="h2" className="flex-1">
            Files
          </SectionLabel>
          <IconButton label="Refresh" size={24} onClick={() => root.refetch()}>
            <RefreshIcon size={12} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {root.isError && !root.data && (
            <div className="p-2 text-11 text-err">{(root.error as Error).message}</div>
          )}
          {root.data && root.data.entries.length === 0 && <EmptyNote icon={<FolderIcon size={20} />} title="The workspace is empty" className="py-6" />}
          <DirNode path="" depth={0} expanded={expanded} selected={selected} onToggle={toggle} onSelect={select} />
        </div>
      </aside>
      <section className="min-w-0 flex-1" aria-label="Preview">
        <Preview path={selected} />
      </section>
    </div>
  );
}

export default function FilesPage() {
  return (
    <Suspense fallback={<Loading label="Loading files…" />}>
      <FilesBrowser />
    </Suspense>
  );
}
