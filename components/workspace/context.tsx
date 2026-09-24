"use client";

/**
 * Per-workspace UI state shared by the thread pane, the canvas, the rail and
 * the composer: the focus (the one navigation primitive, §2.1), its lineage,
 * unread items, the registry datasets, and the actions cards can trigger.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type DatasetInfo, type SessionStep } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useRunner, type AskInput } from "@/hooks/useWorkspaceRunner";
import { useWorkspaceActions } from "@/lib/workspace-store";
import {
  activeTurn,
  deleteChart as deleteChartFn,
  deleteSubtree,
  hideDataset as hideDatasetFn,
  lineageIds,
  makeTurn,
  refKey,
  refTurnId,
  sameRef,
  setFocus,
  subtreeIds,
  turnById,
  updateTurn,
  upsertTurn,
  type ArtifactRef,
  type ChartArtifact,
  type ChatAttachment,
  type Focus,
  type Turn,
  type Workspace,
} from "@/lib/workspace";

export interface DialogRequest {
  kind: "log" | "code";
  turnId: string;
  step?: number;
}

export interface WorkspaceUi {
  ws: Workspace;
  focus: Focus | null;
  focusedTurn: Turn | null;
  running: Turn | undefined;
  lineage: Set<string>;
  unread: Set<string>;
  isFocused: (ref: ArtifactRef) => boolean;
  /** focus a card; `user` false for programmatic focus (does not count as the user's choice) */
  focusRef: (ref: ArtifactRef | null, opts?: { user?: boolean }) => void;
  /** submit a prompt; parent defaults to the focused card's turn */
  ask: (input: Omit<AskInput, "parentId"> & { parentId?: string | null }) => void;
  retry: (turnId: string) => void;
  stop: () => void;
  answer: (turnId: string, text: string) => Promise<void>;
  deleteTurn: (turnId: string) => void;
  deleteChart: (turnId: string, index: number) => void;
  deleteReport: (turnId: string, index: number) => void;
  updateChart: (turnId: string, index: number, patch: Partial<ChartArtifact>) => void;
  hideDataset: (name: string) => void;
  subtreeCount: (turnId: string) => number;
  openLog: (turnId: string, step?: number) => void;
  openCode: (turnId: string, step?: number) => void;
  dialog: DialogRequest | null;
  closeDialog: () => void;
  datasets: DatasetInfo[];
  datasetsError: string | null;
  datasetsLoading: boolean;
  refetchDatasets: () => void;
  datasetInfo: (name: string) => DatasetInfo | undefined;
  /** the Datasets panel asked the composer to @-mention a dataset */
  mentionRequest: { name: string; nonce: number } | null;
  requestMention: (name: string) => void;
  /** the Add-data panel attached an upload to the next prompt */
  attachRequest: { attachment: ChatAttachment; nonce: number } | null;
  requestAttach: (attachment: ChatAttachment) => void;
  /** Quick chart / Edit chart (client-side Vega-Lite, §7.7) */
  addVegaChart: (parentTurnId: string | null, chart: Omit<ChartArtifact, "id" | "kind" | "step" | "tool">, prompt: string) => void;
  chartEditor: { dataset: string; spec?: Record<string, unknown>; parentTurnId: string | null; anchor: HTMLElement | null; title?: string } | null;
  openChartEditor: (req: NonNullable<WorkspaceUi["chartEditor"]>) => void;
  closeChartEditor: () => void;
  /** the tool_call step matching a tool_result (for the code dialog) */
  stepOf: (turnId: string, step?: number) => SessionStep[] | null;
}

export const WorkspaceUiContext = createContext<WorkspaceUi | null>(null);
const Ctx = WorkspaceUiContext;

export function useWorkspaceUi(): WorkspaceUi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspaceUi must be used inside <WorkspaceUiProvider>");
  return v;
}

export function WorkspaceUiProvider({ ws, children }: { ws: Workspace; children: ReactNode }) {
  const actions = useWorkspaceActions();
  const runner = useRunner();
  const toast = useToast();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [mentionRequest, setMentionRequest] = useState<{ name: string; nonce: number } | null>(null);
  const [attachRequest, setAttachRequest] = useState<{ attachment: ChatAttachment; nonce: number } | null>(null);
  const [chartEditor, setChartEditor] = useState<WorkspaceUi["chartEditor"]>(null);
  const nonce = useRef(0);

  const running = activeTurn(ws);
  const focus = ws.focus;
  const focusedTurnId = refTurnId(focus);
  const focusedTurn = turnById(ws, focusedTurnId) ?? null;
  const lineage = useMemo(() => lineageIds(ws, focusedTurnId), [ws, focusedTurnId]);
  const unread = useMemo(() => new Set(ws.unread), [ws.unread]);

  // registry datasets: poll faster while a run is producing them
  const datasetCount = ws.turns.reduce((n, t) => n + t.artifacts.datasets.length, 0);
  const datasetsQuery = useQuery({
    queryKey: ["data", "datasets"],
    queryFn: api.listDatasets,
    refetchInterval: running ? 4000 : 30000,
  });
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ["data", "datasets"] });
  }, [datasetCount, qc]);
  const datasets = useMemo(() => datasetsQuery.data?.datasets ?? [], [datasetsQuery.data]);
  const datasetInfo = useCallback((name: string) => datasets.find((d) => d.name === name), [datasets]);

  const isFocused = useCallback((ref: ArtifactRef) => sameRef(focus, ref), [focus]);

  const focusRef = useCallback(
    (ref: ArtifactRef | null, opts?: { user?: boolean }) => {
      if (opts?.user !== false) runner.noteUserFocus(ws.id);
      actions.update(ws.id, (w) => setFocus(w, ref));
    },
    [actions, runner, ws.id],
  );

  const ask = useCallback(
    (input: Omit<AskInput, "parentId"> & { parentId?: string | null }) => {
      const parentId = input.parentId !== undefined ? input.parentId : focusedTurnId;
      const parentArtifact = input.parentArtifact ?? (parentId && focus && refTurnId(focus) === parentId ? focus : undefined);
      const turn = runner.ask(ws.id, { ...input, parentId, parentArtifact });
      if (!turn) toast("info", "A run is already in progress in this workspace — stop it or wait for it to finish.");
    },
    [focus, focusedTurnId, runner, toast, ws.id],
  );

  const retry = useCallback((turnId: string) => runner.retry(ws.id, turnId), [runner, ws.id]);
  const stop = useCallback(() => {
    if (running) runner.stop(ws.id, running.id);
  }, [runner, running, ws.id]);
  const answer = useCallback((turnId: string, text: string) => runner.answer(ws.id, turnId, text), [runner, ws.id]);

  const deleteTurn = useCallback(
    (turnId: string) => {
      const t = turnById(ws, turnId);
      if (t?.jobId && (t.status === "queued" || t.status === "running")) runner.stop(ws.id, turnId);
      actions.update(ws.id, (w) => deleteSubtree(w, turnId));
    },
    [actions, runner, ws],
  );
  const deleteChart = useCallback(
    (turnId: string, index: number) => actions.update(ws.id, (w) => deleteChartFn(w, turnId, index)),
    [actions, ws.id],
  );
  const deleteReport = useCallback(
    (turnId: string, index: number) =>
      actions.update(ws.id, (w) => {
        const next = updateTurn(w, turnId, (t) => ({ ...t, artifacts: { ...t.artifacts, reports: t.artifacts.reports.filter((_, i) => i !== index) } }));
        const f = next.focus;
        return f && f.kind === "report" && f.turnId === turnId && f.index === index ? { ...next, focus: null } : next;
      }),
    [actions, ws.id],
  );
  const updateChart = useCallback(
    (turnId: string, index: number, patch: Partial<ChartArtifact>) =>
      actions.update(ws.id, (w) =>
        updateTurn(w, turnId, (t) => ({
          ...t,
          artifacts: { ...t.artifacts, charts: t.artifacts.charts.map((c, i) => (i === index ? { ...c, ...patch } : c)) },
        })),
      ),
    [actions, ws.id],
  );
  const hideDataset = useCallback((name: string) => actions.update(ws.id, (w) => hideDatasetFn(w, name)), [actions, ws.id]);
  const subtreeCount = useCallback((turnId: string) => subtreeIds(ws, turnId).length, [ws]);

  const openLog = useCallback((turnId: string, step?: number) => setDialog({ kind: "log", turnId, step }), []);
  const openCode = useCallback((turnId: string, step?: number) => setDialog({ kind: "code", turnId, step }), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const requestMention = useCallback((name: string) => {
    nonce.current += 1;
    setMentionRequest({ name, nonce: nonce.current });
  }, []);
  const requestAttach = useCallback((attachment: ChatAttachment) => {
    nonce.current += 1;
    setAttachRequest({ attachment, nonce: nonce.current });
  }, []);

  const addVegaChart = useCallback(
    (parentTurnId: string | null, chart: Omit<ChartArtifact, "id" | "kind" | "step" | "tool">, prompt: string) => {
      const turn = makeTurn({ prompt, parentId: parentTurnId, manual: true });
      turn.artifacts.charts.push({ ...chart, id: crypto.randomUUID(), kind: "vega", step: 0, tool: "quick_chart" });
      actions.update(ws.id, (w) => setFocus(upsertTurn(w, turn), { kind: "chart", turnId: turn.id, index: 0 }));
    },
    [actions, ws.id],
  );

  const stepOf = useCallback(
    (turnId: string, step?: number) => {
      const t = turnById(ws, turnId);
      if (!t) return null;
      if (step == null) return t.steps;
      return t.steps.filter((s) => s.data.step === step);
    },
    [ws],
  );

  const value = useMemo<WorkspaceUi>(
    () => ({
      ws,
      focus,
      focusedTurn,
      running,
      lineage,
      unread,
      isFocused,
      focusRef,
      ask,
      retry,
      stop,
      answer,
      deleteTurn,
      deleteChart,
      deleteReport,
      updateChart,
      hideDataset,
      subtreeCount,
      openLog,
      openCode,
      dialog,
      closeDialog,
      datasets,
      datasetsError: datasetsQuery.error ? (datasetsQuery.error as Error).message : null,
      datasetsLoading: datasetsQuery.isPending,
      refetchDatasets: () => void datasetsQuery.refetch(),
      datasetInfo,
      mentionRequest,
      requestMention,
      attachRequest,
      requestAttach,
      addVegaChart,
      chartEditor,
      openChartEditor: setChartEditor,
      closeChartEditor: () => setChartEditor(null),
      stepOf,
    }),
    [
      ws,
      focus,
      focusedTurn,
      running,
      lineage,
      unread,
      isFocused,
      focusRef,
      ask,
      retry,
      stop,
      answer,
      deleteTurn,
      deleteChart,
      deleteReport,
      updateChart,
      hideDataset,
      subtreeCount,
      openLog,
      openCode,
      dialog,
      closeDialog,
      datasets,
      datasetsQuery,
      datasetInfo,
      mentionRequest,
      requestMention,
      attachRequest,
      requestAttach,
      addVegaChart,
      chartEditor,
      stepOf,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { refKey };
