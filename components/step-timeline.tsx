"use client";

/**
 * The step timeline: every agent step (plan, tool call, tool result,
 * correction, complete, error) as a gutter row with its icon, colour-coded
 * kind label and an expandable payload. Used by the log dialog, the plan
 * line, session detail and job detail.
 */

import { useEffect, useRef, useState } from "react";
import type { SessionStep, StepKind } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { stepIcon } from "@/lib/toolMeta";
import { stepIconNode } from "@/components/workspace/thread/thinking";
import { CodeIcon, GutterRow, IconButton, Shimmer } from "@/components/ui";

const KIND_META: Record<StepKind, { label: string; text: string; tone: "muted" | "accent" | "report" | "warn" | "err" | "ask" }> = {
  plan: { label: "plan", text: "text-accent", tone: "accent" },
  tool_call: { label: "tool call", text: "text-report", tone: "report" },
  tool_result: { label: "result", text: "text-muted", tone: "muted" },
  correction: { label: "correction", text: "text-warn", tone: "warn" },
  complete: { label: "complete", text: "text-ok", tone: "muted" },
  error: { label: "error", text: "text-err", tone: "err" },
};

function asText(v: unknown, max = 400): { text: string; truncated: boolean } {
  let s: string;
  if (typeof v === "string") s = v;
  else s = JSON.stringify(v, null, 1) ?? "";
  if (s.length > max) return { text: s.slice(0, max), truncated: true };
  return { text: s, truncated: false };
}

function StepBody({ step }: { step: SessionStep }) {
  const [expanded, setExpanded] = useState(false);
  const d = step.data;
  let payload: unknown = null;
  let title = "";
  switch (step.kind) {
    case "plan":
      payload = d.text ?? "";
      break;
    case "tool_call":
      title = String(d.tool ?? "");
      payload = d.input;
      break;
    case "tool_result":
      title = String(d.tool ?? "");
      payload = d.result;
      break;
    case "correction":
      title = `${d.tool ?? ""} — ${d.error_kind ?? "error"} (attempt ${d.attempt ?? "?"})`;
      break;
    case "complete":
      payload = d.summary ?? d.text ?? d;
      break;
    case "error":
      title = String(d.reason ?? "error");
      break;
  }
  const { text, truncated } = asText(payload ?? "", expanded ? 100_000 : 400);
  return (
    <div className="min-w-0 flex-1">
      {title && <span className="font-mono text-11 font-medium text-fg">{title}</span>}
      {text && (
        <pre className="mt-0.5 max-w-full overflow-x-auto font-mono text-11 leading-relaxed break-words whitespace-pre-wrap text-muted">
          {text}
          {truncated && !expanded && "…"}
        </pre>
      )}
      {truncated && (
        <button onClick={() => setExpanded(true)} className="mt-0.5 text-11 text-accent hover:underline">
          show all
        </button>
      )}
      {expanded && (
        <button onClick={() => setExpanded(false)} className="mt-0.5 text-11 text-accent hover:underline">
          collapse
        </button>
      )}
    </div>
  );
}

export function StepTimeline({
  steps,
  compact,
  highlightStep,
  live,
  onOpenCode,
}: {
  steps: SessionStep[];
  /** tighter rows (inside a thread column) */
  compact?: boolean;
  /** scroll to and ring the rows of this step number */
  highlightStep?: number;
  /** the run is in progress: the last open tool call shimmers */
  live?: boolean;
  onOpenCode?: (step: number) => void;
}) {
  const target = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (highlightStep != null) target.current?.scrollIntoView({ block: "center" });
  }, [highlightStep, steps.length]);

  // the active step: the last tool_call with no matching tool_result yet
  let activeIndex = -1;
  if (live) {
    const open = new Map<string, number>();
    steps.forEach((s, i) => {
      const key = `${s.data.step}:${s.data.tool}`;
      if (s.kind === "tool_call") open.set(key, i);
      if (s.kind === "tool_result") open.delete(key);
    });
    activeIndex = Math.max(-1, ...open.values());
  }

  return (
    <ol className="relative" aria-label="Agent steps">
      {steps.map((step, i) => {
        const meta = KIND_META[step.kind] ?? KIND_META.tool_result;
        const isTarget = highlightStep != null && step.data.step === highlightStep;
        const active = i === activeIndex;
        return (
          <li key={i} ref={isTarget ? target : undefined} className={compact ? "pb-1.5 last:pb-0" : "pb-2.5 last:pb-0"}>
            <GutterRow icon={stepIconNode(stepIcon(step))} top={i > 0} bottom={i < steps.length - 1} iconTone={meta.tone}>
              <div className={`rounded-card border bg-panel px-2.5 py-1.5 ${isTarget ? "border-accent ring-2 ring-accent/40" : "border-edge"}`}>
                <div className="flex items-baseline gap-2">
                  <span className={`font-mono text-10 font-semibold uppercase ${meta.text}`}>
                    {active ? <Shimmer>{meta.label}</Shimmer> : meta.label}
                  </span>
                  {step.data.step != null && <span className="font-mono text-10 text-faint">step {String(step.data.step)}</span>}
                  <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-10 text-faint">
                    {formatClock(step.time)}
                    {onOpenCode && step.kind === "tool_call" && typeof step.data.step === "number" && (
                      <IconButton label="Show the code / input" size={18} onClick={() => onOpenCode(step.data.step as number)}>
                        <CodeIcon size={11} />
                      </IconButton>
                    )}
                  </span>
                </div>
                <div className="mt-0.5">
                  <StepBody step={step} />
                </div>
              </div>
            </GutterRow>
          </li>
        );
      })}
    </ol>
  );
}
