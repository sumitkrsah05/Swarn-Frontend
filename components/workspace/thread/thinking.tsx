"use client";

/**
 * Live progress inside the thread (docs/guide.md §2.4): one italic row per
 * step with an icon, the active step shimmering with a ticking timer,
 * finished steps faded, and a 12px spinner in the gutter.
 */

import { useEffect, useMemo, useState } from "react";
import type { SessionStep } from "@/lib/api";
import { stepIcon, stepLabel, type StepIcon } from "@/lib/toolMeta";
import type { Turn } from "@/lib/workspace";
import {
  AlertIcon,
  BarChartIcon,
  CheckIcon,
  DocumentIcon,
  ErrorIcon,
  GutterRow,
  SearchIcon,
  Shimmer,
  SparkleIcon,
  SpinnerIcon,
  TableIcon,
  TerminalIcon,
  DatabaseIcon,
} from "@/components/ui";

export function stepIconNode(kind: StepIcon, size = 11) {
  switch (kind) {
    case "code":
      return <TerminalIcon size={size} />;
    case "search":
      return <SearchIcon size={size} />;
    case "chart":
      return <BarChartIcon size={size} />;
    case "table":
      return <TableIcon size={size} />;
    case "report":
      return <DocumentIcon size={size} />;
    case "model":
      return <DatabaseIcon size={size} />;
    case "error":
      return <ErrorIcon size={size} />;
    case "warning":
      return <AlertIcon size={size} />;
    default:
      return <SparkleIcon size={size} />;
  }
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${(s % 60).toString().padStart(2, "0")}s`;
}

/** Ticks once a second from `since` (unix seconds). */
export function useTicker(since: number | null | undefined, running: boolean): string {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (since == null) return "";
  return formatElapsed(now - since);
}

export interface ThinkingRow {
  key: string;
  icon: StepIcon;
  label: string;
  active: boolean;
  tone: "muted" | "err" | "warn";
  since: number;
}

/** Collapse a step feed into banner rows: tool_calls (active until their result), corrections, errors. */
export function thinkingRows(steps: SessionStep[]): ThinkingRow[] {
  const rows: ThinkingRow[] = [];
  const open = new Map<string, number>();
  steps.forEach((s, i) => {
    const key = `${s.data.step ?? i}:${s.data.tool ?? s.kind}`;
    if (s.kind === "tool_call") {
      open.set(key, rows.length);
      rows.push({ key: `${i}`, icon: stepIcon(s), label: stepLabel(s), active: true, tone: "muted", since: s.time });
    } else if (s.kind === "tool_result") {
      const at = open.get(key);
      if (at != null) rows[at] = { ...rows[at], active: false };
      open.delete(key);
    } else if (s.kind === "correction") {
      rows.push({ key: `${i}`, icon: "warning", label: stepLabel(s), active: false, tone: "warn", since: s.time });
    } else if (s.kind === "error") {
      rows.push({ key: `${i}`, icon: "error", label: stepLabel(s), active: false, tone: "err", since: s.time });
    } else if (s.kind === "plan") {
      rows.push({ key: `${i}`, icon: "sparkle", label: "planning…", active: false, tone: "muted", since: s.time });
    }
  });
  return rows;
}

const SHOWN = 8;

/** One banner row: slides in when it appears, sweeps while active, settles with a check. */
function StepRow({ row, elapsed }: { row: ThinkingRow; elapsed: string }) {
  const tone = row.tone === "err" ? "text-err" : row.tone === "warn" ? "text-warn" : row.active ? "text-fg" : "text-faint";
  const done = !row.active && row.tone === "muted";
  return (
    <div className={`flex items-center gap-1.5 text-11 italic leading-5 transition-colors duration-500 animate-step-in ${tone} ${row.active ? "step-active" : ""}`}>
      <span className={`relative z-[1] flex h-3.5 w-3.5 shrink-0 items-center justify-center ${row.active ? "text-accent" : ""}`}>
        {done ? (
          <span key="done" className="flex items-center justify-center text-ok animate-pop">
            <CheckIcon size={11} />
          </span>
        ) : (
          stepIconNode(row.icon)
        )}
      </span>
      {row.active ? (
        <Shimmer className="relative z-[1] truncate trail-dots">{row.label.replace(/…$/, "")}</Shimmer>
      ) : (
        <span className="truncate">{row.label}</span>
      )}
      {row.active && <span className="relative z-[1] ml-auto shrink-0 font-mono text-10 not-italic text-faint tabular-nums">{elapsed}</span>}
    </div>
  );
}

export function ThinkingSteps({ turn, lineage }: { turn: Turn; lineage: boolean }) {
  const rows = useMemo(() => thinkingRows(turn.steps), [turn.steps]);
  const active = rows.find((r) => r.active);
  const elapsed = useTicker(active?.since ?? turn.startedAt, true);
  const hidden = Math.max(0, rows.length - SHOWN);
  const shown = rows.slice(-SHOWN);
  const done = rows.filter((r) => !r.active && r.tone === "muted").length;
  return (
    <GutterRow icon={<SpinnerIcon size={12} />} lineage={lineage} iconTone="accent">
      <div className="relative overflow-hidden rounded-card border border-edge bg-panel px-2 py-1.5 animate-card-in" aria-live="off">
        {rows.length === 0 && (
          <div className="flex items-center gap-1.5 text-11 italic text-muted animate-step-in">
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-breathe motion-reduce:animate-none" />
            </span>
            <Shimmer className="trail-dots">{turn.status === "queued" ? "waiting for a worker" : "thinking"}</Shimmer>
            <span className="ml-auto font-mono text-10 not-italic text-faint tabular-nums">{elapsed}</span>
          </div>
        )}
        {hidden > 0 && (
          <div className="flex items-center gap-1.5 pb-0.5 text-10 italic text-faint">
            <CheckIcon size={10} className="text-ok" />
            {hidden} earlier steps
          </div>
        )}
        {shown.map((r) => (
          <StepRow key={r.key} row={r} elapsed={elapsed} />
        ))}
        {rows.length > 0 && !active && (
          <div className="flex items-center gap-1.5 text-11 italic text-fg step-active animate-step-in">
            <span className="relative z-[1] flex h-3.5 w-3.5 items-center justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-breathe motion-reduce:animate-none" />
            </span>
            <Shimmer className="relative z-[1] trail-dots">thinking</Shimmer>
            <span className="relative z-[1] ml-auto font-mono text-10 not-italic text-faint tabular-nums">{elapsed}</span>
          </div>
        )}
        {done > 0 && (
          <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-grey-tint" aria-hidden>
            <div className="h-full rounded-full bg-accent/60 transition-[width] duration-700 ease-out" style={{ width: `${Math.min(92, 12 + done * 9)}%` }} />
          </div>
        )}
      </div>
    </GutterRow>
  );
}
