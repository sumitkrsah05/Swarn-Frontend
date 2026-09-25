"use client";

/**
 * A read-only thread + canvas for server records (docs/guide.md §8.1–8.2):
 * session detail, react/team job detail. Focus lives in local state; nothing
 * is persisted and no job can be started from here. "Open in workspace"
 * imports the record as a new workspace with one turn.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, type SessionStep } from "@/lib/api";
import { lineageIds, refTurnId, sameRef, turnById, type ArtifactRef, type Focus, type Workspace } from "@/lib/workspace";
import { useWorkspaceActions } from "@/lib/workspace-store";
import { useToast } from "@/components/toast";
import { Canvas } from "./canvas/canvas";
import { WorkspaceUiContext, useWorkspaceUi, type DialogRequest, type WorkspaceUi } from "./context";
import { ThreadPane } from "./thread/thread-pane";
import { Button, SplitPane } from "@/components/ui";

const noop = () => {};

export function StaticWorkspaceUiProvider({ ws, children }: { ws: Workspace; children: React.ReactNode }) {
  const toast = useToast();
  // undefined = the user has not chosen a card yet, so follow the record's own focus
  const [chosen, setFocusState] = useState<Focus | null | undefined>(undefined);
  const focus = chosen === undefined ? ws.focus : chosen;
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const running = ws.turns.find((t) => t.status === "queued" || t.status === "running");
  const datasetsQuery = useQuery({ queryKey: ["data", "datasets"], queryFn: api.listDatasets, refetchInterval: running ? 4000 : 60000 });
  const datasets = useMemo(() => datasetsQuery.data?.datasets ?? [], [datasetsQuery.data]);
  const focusedTurnId = refTurnId(focus);
  const lineage = useMemo(() => lineageIds(ws, focusedTurnId), [ws, focusedTurnId]);
  const readOnly = useCallback(() => toast("info", "This view is read-only — open it in a workspace to continue the analysis."), [toast]);
  const stepOf = useCallback(
    (turnId: string, step?: number): SessionStep[] | null => {
      const t = turnById(ws, turnId);
      if (!t) return null;
      return step == null ? t.steps : t.steps.filter((s) => s.data.step === step);
    },
    [ws],
  );

  const value = useMemo<WorkspaceUi>(
    () => ({
      ws: { ...ws, focus },
      focus,
      focusedTurn: turnById(ws, focusedTurnId) ?? null,
      running,
      lineage,
      unread: new Set<string>(),
      isFocused: (ref: ArtifactRef) => sameRef(focus, ref),
      focusRef: (ref) => setFocusState(ref),
      ask: readOnly,
      retry: readOnly,
      stop: noop,
      answer: async () => readOnly(),
      deleteTurn: readOnly,
      deleteChart: readOnly,
      deleteReport: readOnly,
      updateChart: noop,
      hideDataset: readOnly,
      subtreeCount: () => 1,
      openLog: (turnId, step) => setDialog({ kind: "log", turnId, step }),
      openCode: (turnId, step) => setDialog({ kind: "code", turnId, step }),
      dialog,
      closeDialog: () => setDialog(null),
      datasets,
      datasetsError: datasetsQuery.error ? (datasetsQuery.error as Error).message : null,
      datasetsLoading: datasetsQuery.isPending,
      refetchDatasets: () => void datasetsQuery.refetch(),
      datasetInfo: (name) => datasets.find((d) => d.name === name),
      mentionRequest: null,
      requestMention: noop,
      attachRequest: null,
      requestAttach: noop,
      addVegaChart: readOnly,
      chartEditor: null,
      openChartEditor: readOnly,
      closeChartEditor: noop,
      stepOf,
    }),
    [ws, focus, focusedTurnId, running, lineage, readOnly, dialog, datasets, datasetsQuery, stepOf],
  );
  return <WorkspaceUiContext.Provider value={value}>{children}</WorkspaceUiContext.Provider>;
}

export function StaticThread({ ws, className = "" }: { ws: Workspace; className?: string }) {
  return (
    <StaticWorkspaceUiProvider ws={ws}>
      <StaticSurface className={className} />
    </StaticWorkspaceUiProvider>
  );
}

function StaticSurface({ className }: { className: string }) {
  const ui = useWorkspaceUi();
  const open = !!ui.focus;
  return (
    <div className={`h-full min-h-0 ${className}`}>
      <SplitPane left={<ThreadPane centred={!open} />} right={<Canvas onClose={() => ui.focusRef(null)} />} rightOpen={open} leftMin={280} rightMin={420} defaultLeftPx={560} />
    </div>
  );
}

/** "Open in workspace": import a one-turn workspace and go to it. */
export function OpenInWorkspaceButton({
  build,
  jobId,
  sessionId,
  label = "Open in workspace",
}: {
  build: () => Workspace | null;
  /** when a workspace already holds this job / session, go there instead of importing a copy */
  jobId?: string | null;
  sessionId?: string | null;
  label?: string;
}) {
  const actions = useWorkspaceActions();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      size="sm"
      variant="primary"
      onClick={() => {
        // the workspace that started this run keeps it: focus its turn and go back
        for (const w of actions.getState().workspaces) {
          const turn = w.turns.find((t) => (jobId && t.jobId === jobId) || (sessionId && t.sessionId === sessionId));
          if (turn) {
            const running = turn.status === "queued" || turn.status === "running";
            const focus: Focus = running || !turn.answer ? { kind: "turn", turnId: turn.id } : { kind: "answer", turnId: turn.id };
            actions.update(w.id, (cur) => ({ ...cur, focus }));
            actions.setActive(w.id);
            router.push("/");
            return;
          }
        }
        const ws = build();
        if (!ws) {
          toast("error", "Nothing to import yet.");
          return;
        }
        actions.add(ws);
        actions.setActive(ws.id);
        router.push("/");
      }}
    >
      {label}
    </Button>
  );
}
