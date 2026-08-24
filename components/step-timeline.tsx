"use client";

import { useState } from "react";
import type { SessionStep, StepKind } from "@/lib/api";
import { formatClock } from "@/lib/format";

const KIND_META: Record<StepKind, { dot: string; label: string; text: string }> =
  {
    plan: { dot: "bg-accent", label: "plan", text: "text-accent" },
    tool_call: { dot: "bg-violet", label: "tool call", text: "text-violet" },
    tool_result: { dot: "bg-faint", label: "result", text: "text-muted" },
    correction: { dot: "bg-warn", label: "correction", text: "text-warn" },
    complete: { dot: "bg-ok", label: "complete", text: "text-ok" },
    error: { dot: "bg-err", label: "error", text: "text-err" },
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
      title = "";
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
      payload = null;
      break;
    case "complete":
      title = "";
      payload = d.summary ?? d.text ?? d;
      break;
    case "error":
      title = String(d.reason ?? "error");
      payload = null;
      break;
  }

  const { text, truncated } = asText(payload ?? "", expanded ? 100_000 : 400);

  return (
    <div className="min-w-0 flex-1">
      {title && (
        <span className="font-mono text-xs font-medium text-fg">{title}</span>
      )}
      {text && (
        <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted">
          {text}
          {truncated && !expanded && "…"}
        </pre>
      )}
      {truncated && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-0.5 text-[11px] text-accent hover:underline"
        >
          show all
        </button>
      )}
      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-0.5 text-[11px] text-accent hover:underline"
        >
          collapse
        </button>
      )}
    </div>
  );
}

export function StepTimeline({ steps }: { steps: SessionStep[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((step, i) => {
        const meta = KIND_META[step.kind] ?? KIND_META.tool_result;
        return (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {/* rail */}
            {i < steps.length - 1 && (
              <span className="absolute left-[5px] top-4 h-full w-px bg-edge" />
            )}
            <span
              className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${meta.dot}`}
            />
            <div className="min-w-0 flex-1 rounded-md border border-edge bg-panel px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-[11px] font-semibold uppercase ${meta.text}`}
                >
                  {meta.label}
                </span>
                {step.data.step != null && (
                  <span className="font-mono text-[11px] text-faint">
                    step {String(step.data.step)}
                  </span>
                )}
                <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                  {formatClock(step.time)}
                </span>
              </div>
              <div className="mt-1">
                <StepBody step={step} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
