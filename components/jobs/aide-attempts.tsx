"use client";

/**
 * AIDE job progress as a thread of attempt cards (docs/guide.md §8.1): one
 * gutter row per `node` event — stage, metric, best-so-far, the note —
 * buggy nodes tinted red with a bug icon, the best node starred and ringed.
 */

import { useState } from "react";
import type { JobEvent } from "@/lib/api";
import { formatMetric } from "@/lib/format";
import { BugIcon, GutterRow, SparkleIcon, StarIcon, TintCard } from "@/components/ui";

const STAGE_TONE: Record<string, string> = {
  draft: "text-accent",
  debug: "text-warn",
  improve: "text-report",
};

function AttemptNote({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  if (!note) return null;
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={`mt-1 w-full text-left text-11 leading-snug text-muted ${open ? "whitespace-pre-wrap break-words" : "clamp-3 break-words"}`}
      title={open ? "Collapse" : "Expand"}
    >
      {note}
    </button>
  );
}

export function AideAttempts({ nodes, bestMetric, running }: { nodes: JobEvent[]; bestMetric: number | null; running: boolean }) {
  // the best node: the last non-buggy node whose metric is the final best
  let bestIndex = -1;
  if (bestMetric != null) {
    nodes.forEach((n, i) => {
      if (!n.is_buggy && n.metric != null && n.metric === bestMetric) bestIndex = i;
    });
  }
  return (
    <div className="w-full max-w-[560px]">
      <div className="mb-1.5 flex items-center gap-1.5 pl-0.5 text-muted">
        <span className="h-2 w-2 rounded-full border-2 border-faint" aria-hidden />
        <span className="text-11 font-bold tracking-[0.04em] uppercase">Search</span>
        <span className="font-mono text-10 text-faint">
          {nodes.length} node{nodes.length === 1 ? "" : "s"}
        </span>
      </div>
      {nodes.length === 0 && (
        <GutterRow icon={<SparkleIcon size={12} />} top={false} bottom={false}>
          <p className="px-1 py-1 text-12 text-muted">{running ? "Waiting for the first node…" : "No node events."}</p>
        </GutterRow>
      )}
      {nodes.map((n, i) => {
        const best = i === bestIndex;
        const buggy = !!n.is_buggy;
        return (
          <GutterRow
            key={i}
            icon={buggy ? <BugIcon size={12} /> : best ? <StarIcon size={12} /> : <SparkleIcon size={12} />}
            top={i > 0}
            bottom={i < nodes.length - 1}
            iconTone={buggy ? "err" : best ? "accent" : "muted"}
            className="pb-1.5"
          >
            <TintCard role={buggy ? "err" : best ? "data" : "grey"} radius="card" focused={best} className="px-2.5 py-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-mono text-10 text-faint">#{n.step}</span>
                <span className={`text-10 font-bold tracking-[0.04em] uppercase ${STAGE_TONE[n.stage ?? ""] ?? "text-muted"}`}>{n.stage ?? "node"}</span>
                {buggy && <span className="text-10 font-bold tracking-[0.04em] text-err uppercase">buggy</span>}
                {n.suspicious && <span className="text-10 font-bold tracking-[0.04em] text-warn uppercase">suspicious</span>}
                {best && <span className="text-10 font-bold tracking-[0.04em] text-accent uppercase">★ best</span>}
                <span className="ml-auto font-mono text-11 text-fg">
                  {n.metric != null ? formatMetric(n.metric) : "—"}
                  <span className="text-faint"> · best {formatMetric(n.best_metric)}</span>
                </span>
              </div>
              <AttemptNote note={n.note ?? ""} />
            </TintCard>
          </GutterRow>
        );
      })}
    </div>
  );
}
