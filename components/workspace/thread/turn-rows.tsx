"use client";

/**
 * The rows of one turn, in order (docs/guide.md §7.4):
 *  1. prompt card · 2. plan line (or the live thinking banner) · 3. per
 *  dataset: merge row, table card, its charts · 4. remaining charts ·
 *  5. report cards · 6. answer card (plus the agent question, if any).
 */

import { useState } from "react";
import type { Turn } from "@/lib/workspace";
import { useWorkspaceUi } from "../context";
import { AnswerCard, ChartThumb, MergeRow, PlanLine, PromptCard, ReportCard, TableCard } from "./rows";
import { ThinkingSteps } from "./thinking";
import { GutterRow, RobotIcon } from "@/components/ui";

/** Cards animate in only while their turn is live (or finished moments ago). */
function Enter({ live, index, children }: { live: boolean; index: number; children: React.ReactNode }) {
  if (!live) return <>{children}</>;
  return (
    <div className="animate-card-in" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
      {children}
    </div>
  );
}

export function TurnRows({ turn, first, last }: { turn: Turn; first: boolean; last: boolean }) {
  const ui = useWorkspaceUi();
  const lineage = ui.lineage.has(turn.id);
  const running = turn.status === "queued" || turn.status === "running";
  // cards that arrived while this view was open animate in; older ones sit still
  const [mountedAt] = useState(() => Date.now() / 1000);
  const live = running || (turn.finishedAt != null && turn.finishedAt >= mountedAt);
  let order = 0;
  const hidden = new Set(ui.ws.hiddenDatasets ?? []);
  const datasets = turn.artifacts.datasets.filter((d) => !hidden.has(d.name));
  const charts = turn.artifacts.charts;
  const placed = new Set<number>();
  const chartsFor = (name: string) =>
    charts
      .map((c, i) => ({ c, i }))
      .filter(({ c, i }) => c.dataset === name && !placed.has(i))
      .map(({ c, i }) => {
        placed.add(i);
        return { c, i };
      });
  const composingReport = running && turn.intent === "report" && turn.artifacts.reports.length === 0;
  const hasAnswer = !!turn.answer && !running;
  const rowsAfter = datasets.length + charts.length + turn.artifacts.reports.length + (hasAnswer ? 1 : 0) + (composingReport ? 1 : 0);
  const lastRowIsAnswer = hasAnswer;

  return (
    <div className="pb-2" data-turn={turn.id}>
      <PromptCard turn={turn} first={first} lineage={lineage} />
      {running && !turn.manual ? <ThinkingSteps turn={turn} lineage={lineage} /> : <PlanLine turn={turn} lineage={lineage} />}
      {turn.question && running && (
        <GutterRow icon={<RobotIcon size={12} className="animate-bounce-soft motion-reduce:animate-none" />} lineage={lineage} iconTone="ask">
          <div className="rounded-card border border-ask/40 bg-ask-tint px-2 py-1 text-11 text-fg">
            (awaiting your answer) <span className="text-muted">{turn.question.question}</span>
          </div>
        </GutterRow>
      )}
      {datasets.map((d) => (
        <div key={d.name}>
          {d.parents.length > 1 && <MergeRow parents={d.parents} lineage={lineage} />}
          <Enter live={live} index={order++}>
            <TableCard turn={turn} dataset={d} lineage={lineage} />
          </Enter>
          {chartsFor(d.name).map(({ c, i }) => (
            <Enter key={c.id} live={live} index={order++}>
              <ChartThumb turn={turn} chart={c} index={i} lineage={lineage} />
            </Enter>
          ))}
        </div>
      ))}
      {charts.map((c, i) =>
        placed.has(i) ? null : (
          <Enter key={c.id} live={live} index={order++}>
            <ChartThumb turn={turn} chart={c} index={i} lineage={lineage} />
          </Enter>
        ),
      )}
      {turn.artifacts.reports.map((r, i) => (
        <Enter key={`${r.htmlPath ?? r.mdPath ?? i}`} live={live} index={order++}>
          <ReportCard turn={turn} report={r} index={i} lineage={lineage} />
        </Enter>
      ))}
      {composingReport && <ReportCard turn={turn} report={null} index={-1} lineage={lineage} />}
      {hasAnswer && (
        <Enter live={live} index={order++}>
          <AnswerCard turn={turn} lineage={lineage} last={last && lastRowIsAnswer} />
        </Enter>
      )}
      {!hasAnswer && rowsAfter === 0 && !running && !last && <div className="h-1" />}
    </div>
  );
}
