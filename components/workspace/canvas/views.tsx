"use client";

/**
 * Canvas views by focus (docs/guide.md §7.7): dataset grid card, png / vega
 * chart with zoom and pills, report document column, answer markdown, and
 * the live timeline of a running turn.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, datasetExportUrl, workspaceFileUrl } from "@/lib/api";
import { extractFileMentions, isImagePath } from "@/lib/format";
import { stepLabel } from "@/lib/toolMeta";
import { autoEncode, buildSpec, chartName, configFromToolInput, type ChartConfig } from "@/lib/vega";
import type { ChartArtifact, ReportArtifact, Turn } from "@/lib/workspace";
import { Markdown } from "@/components/markdown";
import { StepTimeline } from "@/components/step-timeline";
import { CopyAction, DocumentColumn, type DocumentAction } from "@/components/document-column";
import { useWorkspaceUi } from "../context";
import { DataGrid } from "../data-grid";
import { ChartGalleryPopover } from "./chart-editor";
import { VegaChart } from "./vega-chart";
import {
  BarChartIcon,
  Button,
  CodeIcon,
  DocumentIcon,
  DownloadIcon,
  EmptyNote,
  ExternalIcon,
  IconButton,
  ImageIcon,
  Input,
  Loading,
  LogIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  PillButton,
  SearchIcon,
  SectionLabel,
  StopIcon,
  TableIcon,
  TrashIcon,
} from "@/components/ui";

export const STATUS_LINE = "AI-generated results can be inaccurate — inspect them.";
const ZOOM_STOPS = [0.6, 0.8, 1, 1.25, 1.5, 2];

export function StatusLine({ extra }: { extra?: string }) {
  return (
    <p className="px-1 py-1 text-11 text-faint">
      {STATUS_LINE}
      {extra && <span className="ml-2 font-mono text-muted">{extra}</span>}
    </p>
  );
}

// ---------------------------------------------------------------- dataset

export function DatasetView({ name, turnId, embedded, onQuickChart }: { name: string; turnId: string | null; embedded?: boolean; onQuickChart?: (anchor: HTMLElement) => void }) {
  const ui = useWorkspaceUi();
  const info = ui.datasetInfo(name);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const [maxed, setMaxed] = useState(false);
  const [galleryAnchor, setGalleryAnchor] = useState<HTMLElement | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const turn = turnId ? ui.ws.turns.find((t) => t.id === turnId) : undefined;
  const producer = turn ?? ui.ws.turns.find((t) => t.artifacts.datasets.some((d) => d.name === name));

  const missing = gone || (!info && !ui.datasetsLoading && ui.datasets.length >= 0 && !ui.datasetsError);
  if (missing && !ui.datasetsLoading) {
    return (
      <div className="flex h-full flex-col">
        <EmptyNote
          icon={<TableIcon size={26} />}
          title={`'${name}' is not in memory`}
          hint="The server may have restarted. Re-run the step that created it and the table comes back."
          action={
            producer ? (
              <Button size="sm" variant="primary" disabled={!!ui.running} onClick={() => ui.retry(producer.id)}>
                Re-run this turn
              </Button>
            ) : undefined
          }
          className="flex-1"
        />
      </div>
    );
  }
  if (!info) return <Loading label="Loading dataset…" />;

  const rows = total ?? info.rows;
  const gridHeight = embedded && !maxed ? 360 : "100%";
  const grid = (
    <DataGrid
      name={name}
      columns={info.columns}
      derived={info.derived_columns}
      q={query}
      height={gridHeight}
      onTotal={setTotal}
      onGone={() => setGone(true)}
      draggable={!!ui.chartEditor}
    />
  );

  const dock = (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-edge px-2 py-1.5">
      <PillButton
        size="sm"
        ref={setGalleryAnchor}
        onClick={() => {
          if (onQuickChart && galleryAnchor) onQuickChart(galleryAnchor);
          else setGalleryOpen((o) => !o);
        }}
      >
        <BarChartIcon size={12} />
        Quick chart
      </PillButton>
      <a href={datasetExportUrl(name)} download={`${name}.csv`} className="inline-flex h-6 items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2 text-12 text-fg shadow-hair hover:border-accent hover:text-accent">
        <DownloadIcon size={12} />
        Download CSV
      </a>
      <span className="ml-auto font-mono text-11 text-muted">
        {rows.toLocaleString()} rows{query ? " (filtered)" : ""}
      </span>
      {embedded && (
        <IconButton label={maxed ? "Restore the grid" : "Maximise the grid"} size={24} onClick={() => setMaxed((m) => !m)}>
          {maxed ? <MinimizeIcon size={13} /> : <MaximizeIcon size={13} />}
        </IconButton>
      )}
      <ChartGalleryPopover
        anchor={galleryAnchor}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPick={(type) => {
          const auto = autoEncode(type, info.columns);
          const spec = buildSpec(auto, info.columns);
          const parent = producer?.id ?? turnId ?? null;
          ui.addVegaChart(parent, { dataset: name, spec, config: auto as unknown as Record<string, unknown>, title: `${chartTitle(auto)} of ${name}` }, `Quick chart: ${chartTitle(auto)}`);
        }}
      />
    </div>
  );

  const card = (
    <div className={`flex min-h-0 flex-col ${maxed ? "absolute inset-2 z-[5] rounded-canvas border border-edge bg-panel shadow-pop" : "h-full"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <TableIcon size={14} className="shrink-0 text-accent" />
            <h2 className="truncate text-16 font-semibold text-fg">{name}</h2>
          </div>
          <div className="font-mono text-11 text-muted">
            {info.rows.toLocaleString()} rows · {info.cols.toLocaleString()} columns
            {info.derived_columns.length > 0 && <span className="text-user"> · {info.derived_columns.length} derived</span>}
            {info.parents.length > 0 && <span className="text-faint"> · from {info.parents.join(", ")}</span>}
          </div>
        </div>
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <SearchIcon size={13} className="text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search rows (Enter)" aria-label="Search rows" className="h-7 w-44 py-0 text-12" />
        </form>
      </div>
      <div className="min-h-0 flex-1 border-t border-edge">{grid}</div>
      {dock}
    </div>
  );

  return <div className={`relative ${embedded && !maxed ? "" : "h-full"}`}>{card}</div>;
}

export function chartTitle(config: ChartConfig): string {
  return chartName(config.type);
}

// ------------------------------------------------------------------ chart

export function ChartView({ turn, chart, index }: { turn: Turn; chart: ChartArtifact; index: number }) {
  const ui = useWorkspaceUi();
  const [zoom, setZoom] = useState(1);
  const [armed, setArmed] = useState(false);
  const [broken, setBroken] = useState(false);
  const editAnchor = useRef<HTMLButtonElement | null>(null);
  const png = chart.kind === "png";
  const title = chart.title ?? chart.path?.split("/").pop() ?? "chart";
  const step = chart.step || undefined;
  const info = chart.dataset ? ui.datasetInfo(chart.dataset) : undefined;

  const editChart = () => {
    if (!chart.dataset || !info) return;
    if (png) {
      // a png is not editable in place: a NEW vega chart next to it
      const cfg = configFromToolInput(chart.tool, chart.input, info.columns);
      const spec = buildSpec(cfg, info.columns);
      ui.addVegaChart(turn.id, { dataset: chart.dataset, spec, config: cfg as unknown as Record<string, unknown>, title: `${chartTitle(cfg)} of ${chart.dataset}` }, `Edit chart: ${title}`);
      return;
    }
    ui.openChartEditor({ dataset: chart.dataset, spec: chart.spec, parentTurnId: turn.id, anchor: editAnchor.current, title });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* floating toolbar */}
      <div className="sticky top-0 z-[3] flex flex-wrap items-center gap-2 bg-panel/90 px-3 py-2 backdrop-blur-sm">
        <label className="flex items-center gap-2 text-11 text-muted">
          <span className="sr-only">Zoom</span>
          <input
            type="range"
            min={0}
            max={ZOOM_STOPS.length - 1}
            step={1}
            value={ZOOM_STOPS.indexOf(zoom)}
            onChange={(e) => setZoom(ZOOM_STOPS[Number(e.target.value)])}
            aria-label="Zoom"
            className="w-28 accent-accent"
          />
          <span className="w-9 font-mono">{Math.round(zoom * 100)}%</span>
        </label>
        <span className="flex-1" />
        {!turn.manual && (
          <>
            <PillButton size="sm" onClick={() => ui.openLog(turn.id, step)}>
              <LogIcon size={12} />
              log
            </PillButton>
            <PillButton size="sm" onClick={() => ui.openCode(turn.id, step)}>
              <CodeIcon size={12} />
              code
            </PillButton>
          </>
        )}
        {png && chart.path && (
          <a href={workspaceFileUrl(chart.path)} target="_blank" rel="noreferrer" className="inline-flex h-6 items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2 text-12 text-fg shadow-hair hover:border-accent hover:text-accent">
            <ExternalIcon size={12} />
            open
          </a>
        )}
        <PillButton size="sm" ref={editAnchor} onClick={editChart} disabled={!chart.dataset || !info} title={!chart.dataset ? "The chart's dataset is unknown" : undefined}>
          <PencilIcon size={12} />
          Edit chart
        </PillButton>
      </div>

      {/* the chart, vertically centred, fades in on change */}
      <div key={chart.id} className="flex items-center justify-center overflow-auto px-3 animate-fade-in" style={{ minHeight: "min(75vh, 800px)" }}>
        {png && chart.path ? (
          broken ? (
            <EmptyNote icon={<BarChartIcon size={24} />} title="The chart image is no longer in the workspace" hint={chart.path} />
          ) : (
            // agent-produced media: a plain <img>
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspaceFileUrl(chart.path)}
              alt={title}
              onError={() => setBroken(true)}
              className="max-w-full rounded-panel border border-edge bg-white"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center", maxHeight: "min(72vh, 760px)" }}
            />
          )
        ) : (
          <div className="w-full" style={{ height: "min(70vh, 720px)", transform: `scale(${zoom})`, transformOrigin: "center" }}>
            {chart.spec ? <VegaChart spec={chart.spec} dataset={chart.dataset} /> : <EmptyNote title="No chart specification" />}
          </div>
        )}
      </div>

      {/* quick-config pill */}
      <div className="flex items-center justify-center gap-1 px-3 py-1">
        <span className="inline-flex items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2 py-0.5 text-11 text-muted shadow-hair">
          <span className="truncate font-mono">{title}</span>
          {chart.dataset && <span className="text-faint">· {chart.dataset}</span>}
          {armed ? (
            <span className="flex items-center gap-1 text-err">
              Delete this chart?
              <button type="button" onClick={() => ui.deleteChart(turn.id, index)} className="rounded-chip border border-err/40 px-1.5 hover:bg-err-tint">
                yes
              </button>
              <button type="button" onClick={() => setArmed(false)} className="rounded-chip border border-edge px-1.5 text-muted">
                no
              </button>
            </span>
          ) : (
            <IconButton label="Delete this chart" size={20} tone="danger" onClick={() => setArmed(true)}>
              <TrashIcon size={11} />
            </IconButton>
          )}
        </span>
      </div>
      <div className="px-3">
        <StatusLine />
      </div>

      {/* the data grid of the table the chart came from, in the same scroll */}
      {chart.dataset && (
        <div className="relative m-2 mt-1 rounded-panel border border-edge">
          <DatasetView key={chart.dataset} name={chart.dataset} turnId={turn.artifacts.datasets.some((d) => d.name === chart.dataset) ? turn.id : null} embedded />
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- report

export function ReportView({ turn, report, index }: { turn: Turn; report: ReportArtifact; index: number }) {
  const ui = useWorkspaceUi();
  const md = useQuery({
    queryKey: ["workspace", "text", report.mdPath],
    queryFn: () => api.getWorkspaceText(report.mdPath as string),
    enabled: !!report.mdPath,
    staleTime: 60_000,
  });
  const html = useQuery({
    queryKey: ["workspace", "text", report.htmlPath],
    queryFn: () => api.getWorkspaceText(report.htmlPath as string),
    enabled: !!report.htmlPath,
    staleTime: 60_000,
    retry: false,
  });
  const htmlSrc = report.htmlPath && html.isSuccess ? workspaceFileUrl(report.htmlPath) : null;
  const actions: DocumentAction[] = [];
  if (report.htmlPath) actions.push({ label: "Open in a new tab", icon: <ExternalIcon size={14} />, href: workspaceFileUrl(report.htmlPath) });
  if (report.mdPath) actions.push({ label: "Download markdown", icon: <DownloadIcon size={14} />, href: workspaceFileUrl(report.mdPath), download: report.mdPath.split("/").pop() });
  if (report.htmlPath) actions.push({ label: "Download HTML", icon: <DownloadIcon size={14} />, href: workspaceFileUrl(report.htmlPath), download: report.htmlPath.split("/").pop() });
  actions.push({ label: "Delete this report card", icon: <TrashIcon size={14} />, onClick: () => ui.deleteReport(turn.id, index), danger: true });

  const stack = (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-canvas border border-edge bg-panel p-1 shadow-hair">
      {actions.map((a) =>
        a.href ? (
          <a key={a.label} href={a.href} download={a.download} target={a.download ? undefined : "_blank"} rel="noreferrer" title={a.label} aria-label={a.label} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg">
            {a.icon}
          </a>
        ) : (
          <IconButton key={a.label} label={a.label} onClick={a.onClick} tone={a.danger ? "danger" : "default"}>
            {a.icon}
          </IconButton>
        ),
      )}
      {md.data && <CopyAction text={md.data} />}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 pt-2">
        <SectionLabel tone="muted">
          <span className="text-report">Report</span> · {report.title}
        </SectionLabel>
      </div>
      {htmlSrc ? (
        <DocumentColumn title={report.title} htmlSrc={htmlSrc} actions={stack} />
      ) : (report.htmlPath && html.isPending) || (report.mdPath && md.isPending) ? (
        <Loading label="Loading report…" />
      ) : md.isSuccess ? (
        <DocumentColumn title={report.title} markdown={md.data} actions={stack} />
      ) : (
        <EmptyNote
          icon={<DocumentIcon size={24} />}
          title="The report file is no longer in the workspace"
          hint={(html.error as Error | null)?.message ?? (md.error as Error | null)?.message ?? "Re-run the turn that wrote it to regenerate the report."}
        />
      )}
      <div className="px-3 pb-3">
        <StatusLine />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- answer

function FileLinks({ text }: { text: string }) {
  const files = extractFileMentions(text);
  if (files.length === 0) return null;
  const images = files.filter(isImagePath);
  return (
    <div className="mt-4 border-t border-edge pt-3">
      <div className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <a key={f} href={workspaceFileUrl(f)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip border border-edge bg-raised px-2 py-1 font-mono text-11 text-accent hover:border-accent/60">
            {isImagePath(f) ? <ImageIcon size={12} /> : <DownloadIcon size={12} />}
            {f}
          </a>
        ))}
      </div>
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((f) => (
            <a key={f} href={workspaceFileUrl(f)} target="_blank" rel="noreferrer">
              {/* agent-produced media: a plain <img> */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={workspaceFileUrl(f)} alt={f} className="max-h-64 max-w-full rounded-panel border border-edge" loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnswerView({ turn }: { turn: Turn }) {
  const ui = useWorkspaceUi();
  const text = turn.answer ?? "";
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[816px] px-5 py-5 animate-fade-in">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SectionLabel>Answer</SectionLabel>
          {turn.outcome && <span className={`font-mono text-11 ${turn.outcome === "complete" ? "text-ok" : "text-warn"}`}>{turn.outcome}</span>}
          <span className="flex-1" />
          {!turn.manual && turn.steps.length > 0 && (
            <PillButton size="sm" onClick={() => ui.openLog(turn.id)}>
              <LogIcon size={12} />
              log
            </PillButton>
          )}
          {turn.sessionId && (
            <Link href={`/sessions/${encodeURIComponent(turn.sessionId)}`} className="inline-flex h-6 items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2 text-12 text-fg shadow-hair hover:border-accent hover:text-accent">
              <ExternalIcon size={12} />
              view trace
            </Link>
          )}
          {turn.jobId && (
            <Link href={`/jobs/${encodeURIComponent(turn.jobId)}`} className="inline-flex h-6 items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2 text-12 text-fg shadow-hair hover:border-accent hover:text-accent">
              job
            </Link>
          )}
        </div>
        <div className="document">
          <Markdown>{text}</Markdown>
        </div>
        <FileLinks text={text} />
        <div className="mt-4">
          <StatusLine />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- running

export function RunningView({ turn }: { turn: Turn }) {
  const ui = useWorkspaceUi();
  const ref = useRef<HTMLDivElement | null>(null);
  const running = turn.status === "queued" || turn.status === "running";
  useEffect(() => {
    const el = ref.current;
    if (el && running) el.scrollTop = el.scrollHeight;
  }, [turn.steps.length, running]);
  const last = turn.steps[turn.steps.length - 1];
  const label = useMemo(() => stepLabel(last), [last]);
  return (
    <div ref={ref} className="h-full overflow-y-auto px-3 py-3">
      <div className="mb-3 flex items-center gap-2">
        <SectionLabel>{running ? "Running" : turn.status}</SectionLabel>
        {running && <span className="font-mono text-11 text-muted">{label}</span>}
        <span className="flex-1" />
        {running && (
          <Button size="sm" variant="danger" onClick={ui.stop}>
            <StopIcon size={12} />
            Stop
          </Button>
        )}
      </div>
      {turn.failure && <div className="mb-3 rounded-panel border border-err/40 bg-err-tint px-3 py-2 text-12 text-err">{turn.failure}</div>}
      {turn.steps.length === 0 ? (
        <EmptyNote
          icon={<LogIcon size={22} />}
          title={running ? (turn.status === "queued" ? "Waiting for a worker…" : "Waiting for the first step…") : "No steps recorded"}
          hint={running ? "Steps stream in over the live feed as soon as the agent starts acting." : undefined}
        />
      ) : (
        <StepTimeline steps={turn.steps} live={running} onOpenCode={(s) => ui.openCode(turn.id, s)} />
      )}
    </div>
  );
}
