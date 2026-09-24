"use client";

/**
 * The rows of one turn, in order (docs/guide.md §7.4):
 *  1. prompt card · 2. plan line (or the live thinking banner) · 3. per
 *  dataset: merge row, table card, its charts · 4. remaining charts ·
 *  5. report cards · 6. answer card (plus the agent question, if any).
 */

import type { Turn } from "@/lib/workspace";
import { useWorkspaceUi } from "../context";
import { AnswerCard, ChartThumb, MergeRow, PlanLine, PromptCard, ReportCard, TableCard } from "./rows";
import { ThinkingSteps } from "./thinking";
import { GutterRow, RobotIcon } from "@/components/ui";

export function TurnRows({ turn, first, last }: { turn: Turn; first: boolean; last: boolean }) {
  const ui = useWorkspaceUi();
  const lineage = ui.lineage.has(turn.id);
  const running = turn.status === "queued" || turn.status === "running";
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
          <TableCard turn={turn} dataset={d} lineage={lineage} />
          {chartsFor(d.name).map(({ c, i }) => (
            <ChartThumb key={c.id} turn={turn} chart={c} index={i} lineage={lineage} />
          ))}
        </div>
      ))}
      {charts.map((c, i) => (placed.has(i) ? null : <ChartThumb key={c.id} turn={turn} chart={c} index={i} lineage={lineage} />))}
      {turn.artifacts.reports.map((r, i) => (
        <ReportCard key={`${r.htmlPath ?? r.mdPath ?? i}`} turn={turn} report={r} index={i} lineage={lineage} />
      ))}
      {composingReport && <ReportCard turn={turn} report={null} index={-1} lineage={lineage} />}
      {hasAnswer && <AnswerCard turn={turn} lineage={lineage} last={last && lastRowIsAnswer} />}
      {!hasAnswer && rowsAfter === 0 && !running && !last && <div className="h-1" />}
    </div>
  );
}
