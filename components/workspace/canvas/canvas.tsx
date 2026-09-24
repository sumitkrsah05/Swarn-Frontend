"use client";

/**
 * The canvas (docs/guide.md §2.6): a 16px-radius bordered box that opens on
 * whatever is focused, with a ✕ that clears the focus. It hosts the chart
 * editor's drag-and-drop context so grid headers can be dropped into channels.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { buildSpec, type ChartConfig, type Channel } from "@/lib/vega";
import { turnById } from "@/lib/workspace";
import { useWorkspaceUi } from "../context";
import { kindIcon } from "../data-grid";
import { ChartEditorPopover, applyDrop } from "./chart-editor";
import { CanvasDialogs } from "./dialogs";
import { AnswerView, ChartView, DatasetView, ReportView, RunningView } from "./views";
import { CloseIcon, EmptyNote, IconButton } from "@/components/ui";

function EditorHost({ dragging }: { dragging: { column: string; kind?: string } | null }) {
  const ui = useWorkspaceUi();
  const req = ui.chartEditor;
  const focus = ui.focus;
  const chartFocus = focus?.kind === "chart" ? focus : null;
  const turn = chartFocus ? turnById(ui.ws, chartFocus.turnId) : undefined;
  const chart = chartFocus && turn ? turn.artifacts.charts[chartFocus.index] : undefined;
  const info = req ? ui.datasetInfo(req.dataset) : undefined;
  const config = (chart?.config as ChartConfig | undefined) ?? null;

  // the editor follows the focused vega chart; it closes when focus moves elsewhere
  useEffect(() => {
    if (req && (!chart || chart.kind !== "vega")) ui.closeChartEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart?.id, req?.dataset]);

  const onChange = useCallback(
    (c: ChartConfig) => {
      if (!chartFocus || !info) return;
      ui.updateChart(chartFocus.turnId, chartFocus.index, { config: c as unknown as Record<string, unknown>, spec: buildSpec(c, info.columns) });
    },
    [chartFocus, info, ui],
  );

  if (!req || !info || !chart || !config || !chartFocus) return null;
  return (
    <ChartEditorPopover
      anchor={req.anchor}
      open
      onClose={ui.closeChartEditor}
      columns={info.columns}
      config={config}
      spec={chart.spec ?? {}}
      dragging={dragging}
      title={chart.title}
      onChange={onChange}
      onDelete={() => {
        ui.closeChartEditor();
        ui.deleteChart(chartFocus.turnId, chartFocus.index);
      }}
    />
  );
}

export function Canvas({ onClose }: { onClose: () => void }) {
  const ui = useWorkspaceUi();
  const focus = ui.focus;
  const turn = ui.focusedTurn;
  const [dragging, setDragging] = useState<{ column: string; kind?: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = useCallback((e: DragStartEvent) => {
    const d = e.active.data.current as { column?: string; kind?: string } | undefined;
    if (d?.column) setDragging({ column: d.column, kind: d.kind });
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDragging(null);
      const data = e.active.data.current as { column?: string; kind?: string; fromChannel?: Channel } | undefined;
      const target = (e.over?.data.current as { channel?: Channel } | undefined)?.channel;
      const f = ui.focus;
      if (!data?.column || !target || !f || f.kind !== "chart") return;
      const t = turnById(ui.ws, f.turnId);
      const chart = t?.artifacts.charts[f.index];
      const info = chart?.dataset ? ui.datasetInfo(chart.dataset) : undefined;
      const config = chart?.config as ChartConfig | undefined;
      if (!chart || !info || !config) return;
      const next = applyDrop(config, { column: data.column, kind: data.kind, fromChannel: data.fromChannel }, target);
      ui.updateChart(f.turnId, f.index, { config: next as unknown as Record<string, unknown>, spec: buildSpec(next, info.columns) });
    },
    [ui],
  );

  const body = useMemo(() => {
    if (!focus) return null;
    switch (focus.kind) {
      case "dataset":
        return <DatasetView key={focus.name} name={focus.name} turnId={focus.turnId} />;
      case "chart": {
        const c = turn?.artifacts.charts[focus.index];
        return turn && c ? <ChartView key={c.id} turn={turn} chart={c} index={focus.index} /> : <EmptyNote title="This chart no longer exists" />;
      }
      case "report": {
        const r = turn?.artifacts.reports[focus.index];
        return turn && r ? <ReportView turn={turn} report={r} index={focus.index} /> : <EmptyNote title="This report no longer exists" />;
      }
      case "answer":
        return turn ? <AnswerView turn={turn} /> : <EmptyNote title="This turn no longer exists" />;
      case "turn":
        if (!turn) return <EmptyNote title="This turn no longer exists" />;
        return turn.answer && turn.status === "complete" ? <AnswerView turn={turn} /> : <RunningView turn={turn} />;
    }
  }, [focus, turn]);

  if (!focus) return null;
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <section className="relative m-1.5 flex h-[calc(100%-12px)] min-w-0 flex-col overflow-hidden rounded-canvas border border-edge bg-panel animate-fade-in-fast" aria-label="Canvas">
        <IconButton label="Close the canvas" size={26} className="absolute top-1.5 right-1.5 z-[4] bg-panel/80" onClick={onClose}>
          <CloseIcon size={14} />
        </IconButton>
        <div className="min-h-0 flex-1">{body}</div>
        <EditorHost dragging={dragging} />
        <CanvasDialogs />
      </section>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <span className="inline-flex h-6 items-center gap-1 rounded-chip border border-accent bg-accent-tint px-1.5 font-mono text-11 text-accent shadow-pop">
            {kindIcon(dragging.kind as never)}
            {dragging.column}
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}
