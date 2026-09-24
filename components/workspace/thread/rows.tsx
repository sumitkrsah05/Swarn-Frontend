"use client";

/**
 * The thread row types (docs/guide.md §2.3): prompt card, plan line, merge
 * row, table card, chart thumbnail, report card, answer card, fork reference
 * chip and the CONTINUES / CONTINUED markers. Every row is a GutterRow with
 * its type icon; tints follow the semantic colour roles.
 */

import { useEffect, useState, type ReactNode } from "react";
import { workspaceFileUrl } from "@/lib/api";
import { chartKindFor, toolsSummary } from "@/lib/toolMeta";
import { markdownPreview, parseNumberedList } from "@/lib/suggestions";
import type { ChartArtifact, DatasetArtifact, ReportArtifact, Turn } from "@/lib/workspace";
import { StepTimeline } from "@/components/step-timeline";
import { useWorkspaceUi } from "../context";
import { VegaThumb } from "../canvas/vega-chart";
import {
  BarChartIcon,
  BranchIcon,
  Button,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  DocumentIcon,
  GridIcon,
  GutterRow,
  HistogramIcon,
  IconButton,
  LineChartIcon,
  MergeIcon,
  PaperclipIcon,
  PencilIcon,
  PersonIcon,
  PieIcon,
  RobotIcon,
  ScatterIcon,
  Shimmer,
  SparkleIcon,
  SpinnerIcon,
  TableIcon,
  TintCard,
  TrashIcon,
  UnreadDot,
} from "@/components/ui";

type ChartKindIcon = "bar" | "histogram" | "line" | "scatter" | "grid" | "pie" | "chart";

export function chartIcon(kind: ChartKindIcon, size = 12): ReactNode {
  switch (kind) {
    case "bar":
      return <BarChartIcon size={size} />;
    case "histogram":
      return <HistogramIcon size={size} />;
    case "line":
      return <LineChartIcon size={size} />;
    case "scatter":
      return <ScatterIcon size={size} />;
    case "grid":
      return <GridIcon size={size} />;
    case "pie":
      return <PieIcon size={size} />;
    default:
      return <BarChartIcon size={size} />;
  }
}

/** `@dataset` mentions render as highlighted inline chips. */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[\w.-]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^@[\w.-]+$/.test(p) ? (
          <span key={i} className="mx-0.5 inline-block rounded-chip bg-accent-tint px-1 font-mono text-11 text-accent">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function ArmedDelete({ label, count, onConfirm, onCancel }: { label: string; count?: number; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const t = setTimeout(onCancel, 6000);
    return () => clearTimeout(t);
  }, [onCancel]);
  return (
    <span className="ml-auto flex items-center gap-1 rounded-md border border-err/40 bg-panel px-1.5 py-0.5 text-11 text-err">
      {label}
      {count != null && count > 1 && <span className="font-mono">({count} turns)</span>}
      <IconButton label="Confirm delete" size={20} tone="danger" onClick={onConfirm}>
        <CheckIcon size={12} />
      </IconButton>
      <IconButton label="Keep" size={20} onClick={onCancel}>
        <CloseIcon size={12} />
      </IconButton>
    </span>
  );
}

// ---------------------------------------------------------------- prompt

export function PromptCard({ turn, first, lineage }: { turn: Turn; first: boolean; lineage: boolean }) {
  const ui = useWorkspaceUi();
  const ref = { kind: "turn", turnId: turn.id } as const;
  const running = turn.status === "queued" || turn.status === "running";
  const [armed, setArmed] = useState(false);
  const count = ui.subtreeCount(turn.id);
  return (
    <GutterRow
      icon={running ? <SpinnerIcon size={12} /> : turn.manual ? <PencilIcon size={12} /> : <PersonIcon size={12} />}
      lineage={lineage}
      top={!first}
      iconTone={running ? "accent" : "user"}
    >
      <TintCard
        role="user"
        radius="chip"
        focused={ui.isFocused(ref)}
        lineage={lineage}
        className="group cursor-pointer px-2.5 py-2 text-12 leading-snug text-fg"
        data-tree-item={`turn:${turn.id}`}
        onClick={() => ui.focusRef(ref)}
      >
        <div className="max-h-[160px] overflow-hidden whitespace-pre-wrap break-words">
          <MentionText text={turn.prompt} />
        </div>
        {(turn.attachment || turn.manual) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {turn.attachment && (
              <span
                className="inline-flex max-w-full items-center gap-1 rounded-chip border border-edge bg-panel px-1.5 py-0.5 font-mono text-10 text-muted"
                title={turn.attachment.files.join(", ")}
              >
                <PaperclipIcon size={10} />
                <span className="truncate">{turn.attachment.label}</span>
                <span className="text-faint">·{turn.attachment.files.length}</span>
              </span>
            )}
            {turn.manual && (
              <span className="inline-flex items-center rounded-chip border border-edge bg-panel px-1.5 py-0.5 font-mono text-10 text-muted">
                manual
              </span>
            )}
          </div>
        )}
        {turn.failure && (
          <div className="mt-2 rounded-chip border border-err/40 bg-err-tint px-2 py-1.5 text-11 text-err" role="alert">
            <span className="break-words">{turn.failure}</span>
            <Button
              size="sm"
              variant="danger"
              className="ml-2 h-6 px-2 text-11"
              disabled={!!ui.running}
              onClick={(e) => {
                e.stopPropagation();
                ui.retry(turn.id);
              }}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="mt-1 flex min-h-[18px] items-center">
          {armed ? (
            <ArmedDelete label="Delete turn?" count={count} onConfirm={() => ui.deleteTurn(turn.id)} onCancel={() => setArmed(false)} />
          ) : (
            <IconButton
              label={count > 1 ? `Delete this turn and ${count - 1} below it` : "Delete this turn"}
              size={20}
              tone="danger"
              className="reveal ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                setArmed(true);
              }}
            >
              <TrashIcon size={12} />
            </IconButton>
          )}
        </div>
      </TintCard>
    </GutterRow>
  );
}

// ------------------------------------------------------------------ plan

export function PlanLine({ turn, lineage }: { turn: Turn; lineage: boolean }) {
  const ui = useWorkspaceUi();
  const [open, setOpen] = useState(false);
  const plan = turn.steps.find((s) => s.kind === "plan" && typeof s.data.text === "string");
  const text = (plan?.data.text as string | undefined)?.trim() || toolsSummary(turn.steps) || (turn.manual ? "Created from the chart gallery — no agent run." : "No steps were recorded for this turn.");
  return (
    <GutterRow icon={turn.manual ? <PencilIcon size={12} /> : <RobotIcon size={12} />} lineage={lineage}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={turn.steps.length === 0}
        className="flex w-full items-start gap-1 rounded-chip px-1 py-0.5 text-left text-11 leading-snug text-muted transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent"
        title={turn.steps.length ? "Show every step" : undefined}
      >
        <span className={open ? "whitespace-pre-wrap break-words" : "clamp-2 break-words"}>{text}</span>
        {turn.steps.length > 0 && (
          <span className="ml-auto shrink-0 text-faint">{open ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}</span>
        )}
      </button>
      {open && turn.steps.length > 0 && (
        <div className="mt-1 max-h-80 overflow-y-auto rounded-panel border border-edge bg-panel p-2">
          <StepTimeline steps={turn.steps} compact onOpenCode={(step) => ui.openCode(turn.id, step)} />
        </div>
      )}
    </GutterRow>
  );
}

// ----------------------------------------------------------------- merge

export function MergeRow({ parents, lineage }: { parents: string[]; lineage: boolean }) {
  return (
    <GutterRow icon={<MergeIcon size={12} />} lineage={lineage}>
      <div className="flex flex-wrap items-center gap-1 px-1 py-0.5 text-11 text-muted">
        <span>Using</span>
        {parents.map((p) => (
          <span key={p} className="inline-flex items-center gap-0.5 font-mono text-11 text-fg">
            <TableIcon size={11} className="text-accent" />
            {p}
          </span>
        ))}
      </div>
    </GutterRow>
  );
}

// ----------------------------------------------------------------- table

export function TableCard({ turn, dataset, lineage }: { turn: Turn; dataset: DatasetArtifact; lineage: boolean }) {
  const ui = useWorkspaceUi();
  const ref = { kind: "dataset", turnId: turn.id, name: dataset.name } as const;
  const info = ui.datasetInfo(dataset.name);
  const rows = info?.rows ?? dataset.rows;
  const cols = info?.cols ?? dataset.cols;
  return (
    <GutterRow icon={<TableIcon size={12} />} lineage={lineage} iconTone="accent">
      <TintCard
        role="data"
        radius="card"
        focused={ui.isFocused(ref)}
        lineage={lineage}
        lift
        className="group flex cursor-pointer items-center gap-2 px-2.5 py-1.5"
        data-tree-item={`dataset:${turn.id}:${dataset.name}`}
        onClick={() => ui.focusRef(ref)}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-12 font-medium text-fg">{dataset.name}</div>
          <div className="font-mono text-10 text-muted">
            {rows.toLocaleString()} × {cols.toLocaleString()}
            {!info && ui.datasets.length > 0 && <span className="ml-1 text-faint" title="not in the server registry (restarted?)">· not loaded</span>}
          </div>
        </div>
        <IconButton
          label="Hide this card (the dataset stays loaded on the server)"
          size={22}
          tone="danger"
          className="reveal"
          onClick={(e) => {
            e.stopPropagation();
            ui.hideDataset(dataset.name);
          }}
        >
          <TrashIcon size={12} />
        </IconButton>
      </TintCard>
    </GutterRow>
  );
}

// ----------------------------------------------------------------- chart

export function ChartThumb({ turn, chart, index, lineage }: { turn: Turn; chart: ChartArtifact; index: number; lineage: boolean }) {
  const ui = useWorkspaceUi();
  const ref = { kind: "chart", turnId: turn.id, index } as const;
  const unread = ui.unread.has(`chart:${turn.id}:${index}`);
  const kind = chart.kind === "vega" ? ((chart.spec?.mark as { type?: string } | string | undefined) ? vegaKind(chart.spec) : "chart") : chartKindFor(chart.tool);
  const [armed, setArmed] = useState(false);
  const [broken, setBroken] = useState(false);
  const title = chart.title ?? chart.path?.split("/").pop() ?? "chart";
  return (
    <GutterRow icon={chartIcon(kind)} lineage={lineage}>
      <TintCard
        role="none"
        border={false}
        radius="card"
        focused={ui.isFocused(ref)}
        lineage={lineage}
        className="group relative inline-block cursor-pointer bg-transparent p-0.5"
        data-tree-item={`chart:${turn.id}:${index}`}
        onClick={() => ui.focusRef(ref)}
      >
        <div className="flex h-[100px] w-[120px] items-center justify-center overflow-hidden rounded-card border border-edge bg-panel">
          {chart.kind === "png" && chart.path ? (
            broken ? (
              <span className="flex flex-col items-center gap-1 text-faint" title={`${chart.path} is no longer in the workspace`}>
                {chartIcon(kind, 18)}
                <span className="text-10">missing file</span>
              </span>
            ) : (
              // agent-produced media: a plain <img>, lazily loaded
              // eslint-disable-next-line @next/next/no-img-element
              <img src={workspaceFileUrl(chart.path)} alt={title} loading="lazy" onError={() => setBroken(true)} className="max-h-full max-w-full object-contain" />
            )
          ) : (
            <VegaThumb chart={chart} width={116} height={96} />
          )}
        </div>
        {unread && <UnreadDot className="absolute -top-0.5 -right-0.5" label="new chart" />}
        {armed ? (
          <span className="absolute inset-x-0 bottom-0 flex justify-end p-0.5">
            <ArmedDelete label="Delete?" onConfirm={() => ui.deleteChart(turn.id, index)} onCancel={() => setArmed(false)} />
          </span>
        ) : (
          <IconButton
            label="Delete this chart"
            size={20}
            tone="danger"
            className="reveal absolute right-1 bottom-1 bg-panel/80"
            onClick={(e) => {
              e.stopPropagation();
              setArmed(true);
            }}
          >
            <TrashIcon size={11} />
          </IconButton>
        )}
      </TintCard>
    </GutterRow>
  );
}

function vegaKind(spec: Record<string, unknown> | undefined): ChartKindIcon {
  const mark = spec?.mark;
  const type = typeof mark === "string" ? mark : (mark as { type?: string } | undefined)?.type;
  switch (type) {
    case "bar":
      return "bar";
    case "line":
    case "area":
      return "line";
    case "point":
    case "circle":
      return "scatter";
    case "rect":
      return "grid";
    case "arc":
      return "pie";
    case "boxplot":
      return "histogram";
    default:
      return "chart";
  }
}

// ---------------------------------------------------------------- report

export function ReportCard({ turn, report, index, lineage }: { turn: Turn; report: ReportArtifact | null; index: number; lineage: boolean }) {
  const ui = useWorkspaceUi();
  const ref = { kind: "report", turnId: turn.id, index } as const;
  const composing = !report;
  return (
    <GutterRow icon={<DocumentIcon size={12} />} lineage={lineage} iconTone="report">
      <TintCard
        role="report"
        radius="card"
        focused={!composing && ui.isFocused(ref)}
        lineage={lineage}
        lift={!composing}
        className={`px-2.5 py-1.5 ${composing ? "" : "cursor-pointer"}`}
        data-tree-item={composing ? undefined : `report:${turn.id}:${index}`}
        onClick={composing ? undefined : () => ui.focusRef(ref)}
      >
        {composing ? (
          <Shimmer className="text-12">composing…</Shimmer>
        ) : (
          <>
            <div className="truncate text-12 font-medium text-fg">{report.title}</div>
            <div className="font-mono text-10 text-muted">
              {report.htmlPath ? "html" : ""}
              {report.htmlPath && report.mdPath ? " · " : ""}
              {report.mdPath ? "md" : ""}
              {report.dataset ? ` · ${report.dataset}` : ""}
            </div>
          </>
        )}
      </TintCard>
    </GutterRow>
  );
}

// ---------------------------------------------------------------- answer

export function AnswerCard({ turn, lineage, last }: { turn: Turn; lineage: boolean; last: boolean }) {
  const ui = useWorkspaceUi();
  const ref = { kind: "answer", turnId: turn.id } as const;
  const suggestions = turn.intent === "suggest" ? parseNumberedList(turn.answer) : [];
  return (
    <GutterRow icon={<SparkleIcon size={12} />} lineage={lineage} bottom={!last}>
      <TintCard
        role="grey"
        radius="card"
        focused={ui.isFocused(ref)}
        lineage={lineage}
        lift
        className="cursor-pointer px-2.5 py-1.5"
        data-tree-item={`answer:${turn.id}`}
        onClick={() => ui.focusRef(ref)}
      >
        <p className="clamp-2 text-12 leading-snug text-fg">{markdownPreview(turn.answer ?? "")}</p>
        {turn.outcome && turn.outcome !== "complete" && <span className="mt-1 inline-block font-mono text-10 text-warn">{turn.outcome}</span>}
      </TintCard>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!!ui.running}
              onClick={() =>
                ui.ask({ prompt: s, parentId: turn.id, parentArtifact: ref, mentions: turn.mentions })
              }
              className="max-w-full truncate rounded-card border border-edge bg-panel px-2 py-1 text-left text-11 text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </GutterRow>
  );
}

// ------------------------------------------------------- fork / segments

export function ReferenceChip({ turn, skipped }: { turn: Turn; skipped: number }) {
  return (
    <div>
      {skipped > 1 && (
        <GutterRow icon={<span className="text-faint">…</span>} top={false}>
          <div className="px-1 text-11 text-faint" title={`${skipped} earlier turns are on the parent thread`}>
            {skipped} earlier turns
          </div>
        </GutterRow>
      )}
      <GutterRow icon={<BranchIcon size={12} />} top={skipped > 1}>
        <div
          className="flex items-center gap-1.5 rounded-chip border border-edge bg-panel px-2 py-1 text-11 text-muted"
          title={turn.prompt}
        >
          <span className="shrink-0 text-faint">from</span>
          <span className="truncate text-fg">{turn.prompt.replace(/\s+/g, " ")}</span>
        </div>
      </GutterRow>
    </div>
  );
}

export function ContinuesRow() {
  return (
    <div className="mt-1 flex items-center gap-2 border-t border-dashed border-edge pt-1.5 pl-[20px] text-10 font-bold tracking-[0.04em] text-faint uppercase">
      <ChevronDownIcon size={11} /> continues
    </div>
  );
}

export function ContinuedRow({ turn }: { turn: Turn }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 pl-[20px] text-10 font-bold tracking-[0.04em] text-faint uppercase">
        <ChevronUpIcon size={11} /> continued
      </div>
      <GutterRow icon={<BranchIcon size={12} />} top={false}>
        <div className="flex items-center gap-1.5 rounded-chip border border-edge bg-panel px-2 py-1 text-11 text-muted" title={turn.prompt}>
          <span className="shrink-0 text-faint">after</span>
          <span className="truncate text-fg">{turn.prompt.replace(/\s+/g, " ")}</span>
        </div>
      </GutterRow>
    </div>
  );
}

export function FoldedRow({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <GutterRow icon={<span className="text-faint">…</span>}>
      <button type="button" onClick={onExpand} className="rounded-chip px-1 py-0.5 text-11 text-muted hover:bg-hover hover:text-fg">
        {count} earlier turns
      </button>
    </GutterRow>
  );
}
