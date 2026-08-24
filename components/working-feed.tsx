"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionStep } from "@/lib/api";
import type { ThreadStatus } from "@/lib/threads";
import { StepTimeline } from "@/components/step-timeline";

function stepLabel(step: SessionStep | undefined): string {
  if (!step) return "";
  switch (step.kind) {
    case "plan":
      return "planning";
    case "tool_call":
      return `running ${step.data.tool ?? "a tool"}`;
    case "tool_result":
      return `${step.data.tool ?? "tool"} finished`;
    case "correction":
      return `retrying ${step.data.tool ?? "a tool"}`;
    case "complete":
      return "wrapping up";
    case "error":
      return "hit an error";
    default:
      return step.kind;
  }
}

/** Collapsible live "working…" feed shown while a thread's job is in flight. */
export function WorkingFeed({
  steps,
  status,
}: {
  steps: SessionStep[];
  status: ThreadStatus;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (open && el) el.scrollTop = el.scrollHeight;
  }, [open, steps.length]);

  const latest = stepLabel(steps[steps.length - 1]);

  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-accent/30 bg-accent/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
      >
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-edge border-t-accent" />
        <span className="text-sm text-fg">
          {status === "queued" ? "queued…" : "working…"}
        </span>
        {latest && (
          <span className="min-w-0 truncate font-mono text-xs text-muted">
            {latest}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
          {steps.length > 0 && `${steps.length} steps `}
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div
          ref={bodyRef}
          className="max-h-80 overflow-y-auto border-t border-accent/20 px-4 py-3"
        >
          {steps.length === 0 ? (
            <p className="py-2 text-xs text-muted">
              {status === "queued"
                ? "Waiting for a worker to pick the job up…"
                : "No live steps yet — they stream in over /ws/live once the agent starts acting."}
            </p>
          ) : (
            <StepTimeline steps={steps} />
          )}
        </div>
      )}
    </div>
  );
}
