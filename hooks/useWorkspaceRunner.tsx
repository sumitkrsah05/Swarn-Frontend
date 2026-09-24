"use client";

/**
 * Runs workspace turns as backend jobs (docs/guide.md §7.5).
 *
 *  - one `react` job per turn, with `resume_session_ids` = the turn's
 *    ancestors' completed sessions only (lib/workspace.ts resumeChain)
 *  - /ws/live session frames are mapped to the turn through `session_id`
 *  - REST polling (2.5s) of every active job is authoritative: it confirms
 *    terminal states, reconciles jobs that finished while the tab was closed,
 *    and turns a 404 into a failed turn with Retry
 *  - artifacts appear live as tool_result steps arrive; the first chart of a
 *    run is auto-focused, later ones get the unread dot
 *
 * Mounted once at the root (RunnerProvider), so every workspace keeps
 * streaming whichever page is open.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { api, ApiError, type JobDetail, type JobEvent, type JobStatus, type SessionStep } from "@/lib/api";
import { useLiveFrames } from "@/lib/live";
import { useToast } from "@/components/toast";
import { useWorkspaceActions, useWorkspacesLoaded } from "@/lib/workspace-store";
import { artifactsFromStep, artifactsFromSteps, mergeArtifacts } from "@/lib/artifacts";
import {
  activeTurn,
  emptyArtifacts,
  isRunning,
  makeTurn,
  markUnread,
  resumeChain,
  setFocus,
  turnById,
  updateTurn,
  upsertTurn,
  type AgentQuestion,
  type ArtifactRef,
  type ChatAttachment,
  type Turn,
  type Workspace,
} from "@/lib/workspace";

const POLL_MS = 2500;
const LIVE_STEPS_CAP = 500;

export const REPORT_PROMPT =
  "Write a report of the key findings from this exploration using write_report on the most relevant dataset.";
export const SUGGEST_PROMPT =
  "Suggest 3–5 concrete next analyses for the focused data as a numbered list, one line each. Do not run any tools.";

export interface AskInput {
  prompt: string;
  parentId: string | null;
  parentArtifact?: ArtifactRef;
  attachment?: ChatAttachment;
  /** focused / @-mentioned dataset names → the context footer */
  mentions?: string[];
  intent?: Turn["intent"];
}

export interface RunnerApi {
  /** create a turn in the workspace and submit it; false when a job is already running there */
  ask: (wsId: string, input: AskInput) => Turn | null;
  retry: (wsId: string, turnId: string) => void;
  stop: (wsId: string, turnId: string) => void;
  answer: (wsId: string, turnId: string, text: string) => Promise<void>;
  /** the user focused something while a run is in progress */
  noteUserFocus: (wsId: string) => void;
}

const RunnerContext = createContext<RunnerApi | null>(null);

/** The task text sent to the agent: the prompt plus a short context footer. */
export function buildTask(turn: Pick<Turn, "prompt" | "mentions">): string {
  const names = Array.from(new Set(turn.mentions ?? [])).filter(Boolean);
  if (!names.length) return turn.prompt;
  return `${turn.prompt}\n\nUse the already-loaded dataset(s): ${names.map((n) => `'${n}'`).join(", ")}.`;
}

/** Every dataset name known in a workspace (for parent resolution). */
function knownNames(ws: Workspace): Set<string> {
  const set = new Set<string>();
  for (const t of ws.turns) for (const d of t.artifacts.datasets) set.add(d.name);
  return set;
}

function findInput(steps: SessionStep[], step: SessionStep): Record<string, unknown> | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.kind === "tool_call" && s.data.step === step.data.step && s.data.tool === step.data.tool) {
      return s.data.input && typeof s.data.input === "object" ? (s.data.input as Record<string, unknown>) : undefined;
    }
  }
  return undefined;
}

function questionFromEvent(ev: JobEvent | { request_id?: string; id?: string; question?: string; options?: string[]; default?: string }): AgentQuestion | null {
  const id = ev.request_id ?? ("id" in ev ? ev.id : undefined);
  if (!id || typeof ev.question !== "string") return null;
  return {
    requestId: id,
    question: ev.question,
    options: Array.isArray(ev.options) ? ev.options.filter((o): o is string => typeof o === "string") : [],
    default: typeof ev.default === "string" ? ev.default : undefined,
  };
}

interface Target {
  wsId: string;
  turnId: string;
}

export function RunnerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const actions = useWorkspaceActions();
  const loaded = useWorkspacesLoaded();

  const jobToTurn = useRef(new Map<string, Target>());
  const sessionToTurn = useRef(new Map<string, Target>());
  const seenEvents = useRef(new Map<string, number>());
  const pollInFlight = useRef(new Set<string>());
  const userTouched = useRef(new Map<string, boolean>());

  // ------------------------------------------------------------ helpers

  const patchTurn = useCallback(
    (target: Target, fn: (t: Turn, ws: Workspace) => Turn, after?: (ws: Workspace, t: Turn) => Workspace) => {
      actions.update(target.wsId, (ws) => {
        const cur = turnById(ws, target.turnId);
        if (!cur) return ws;
        const next = fn(cur, ws);
        let out = updateTurn(ws, target.turnId, () => next);
        if (after) out = after(out, next);
        return out;
      });
    },
    [actions],
  );

  const appendStep = useCallback(
    (target: Target, jobId: string, step: SessionStep) => {
      patchTurn(
        target,
        (t, ws) => {
          const steps = t.steps.length >= LIVE_STEPS_CAP ? [...t.steps.slice(-LIVE_STEPS_CAP + 1), step] : [...t.steps, step];
          const next: Turn = { ...t, steps, status: t.status === "queued" ? "running" : t.status };
          if (step.kind === "tool_result") {
            const input = (step.data.input as Record<string, unknown> | undefined) ?? findInput(steps, step);
            const known = knownNames(ws);
            const add = artifactsFromStep({ ...step, data: { ...step.data, input } }, known);
            next.artifacts = mergeArtifacts(t.artifacts, add);
          }
          return next;
        },
        (ws, next) => {
          // charts that just appeared: auto-focus the first of the run, unread for the rest
          let out = ws;
          next.artifacts.charts.forEach((_, i) => {
            const key = `chart:${target.turnId}:${i}`;
            if (seenCharts.current.has(key)) return;
            seenCharts.current.add(key);
            const ref: ArtifactRef = { kind: "chart", turnId: target.turnId, index: i };
            if (i === 0 && !userTouched.current.get(jobId)) out = setFocus(out, ref);
            else out = markUnread(out, ref);
          });
          return out;
        },
      );
    },
    [patchTurn],
  );
  const seenCharts = useRef(new Set<string>());

  const reconcileTrace = useCallback(
    (target: Target, traceSteps: SessionStep[]) => {
      patchTurn(
        target,
        (t, ws) => {
          if (traceSteps.length <= t.steps.length) return t;
          const known = knownNames(ws);
          for (const d of t.artifacts.datasets) known.delete(d.name);
          const rebuilt = artifactsFromSteps(traceSteps, known);
          return { ...t, steps: traceSteps.slice(-LIVE_STEPS_CAP), artifacts: mergeArtifacts(rebuilt, t.artifacts) };
        },
        (ws, next) => {
          let out = ws;
          next.artifacts.charts.forEach((_, i) => {
            const key = `chart:${target.turnId}:${i}`;
            if (!seenCharts.current.has(key)) {
              seenCharts.current.add(key);
              out = markUnread(out, { kind: "chart", turnId: target.turnId, index: i });
            }
          });
          return out;
        },
      );
    },
    [patchTurn],
  );

  const forget = useCallback((jobId: string) => {
    jobToTurn.current.delete(jobId);
    seenEvents.current.delete(jobId);
    userTouched.current.delete(jobId);
    pollInFlight.current.delete(jobId);
  }, []);

  const finalize = useCallback(
    (jobId: string, status: JobStatus, result: JobDetail["result"], error: string | null) => {
      const target = jobToTurn.current.get(jobId);
      if (!target) return;
      const now = Date.now() / 1000;
      if (status === "complete") {
        const sessionId = typeof result?.session_id === "string" ? result.session_id : null;
        const answer = result?.summary?.trim() || "(The run completed without a summary.)";
        const outcome = typeof result?.outcome === "string" ? result.outcome : undefined;
        const touched = !!userTouched.current.get(jobId);
        patchTurn(
          target,
          (t) => ({ ...t, status, sessionId, answer, outcome, finishedAt: now, question: undefined, failure: undefined }),
          (ws) => (touched ? ws : setFocus(ws, { kind: "answer", turnId: target.turnId })),
        );
        if (sessionId) {
          api
            .getSession(sessionId)
            .then((s) => {
              if (Array.isArray(s.steps)) reconcileTrace(target, s.steps);
            })
            .catch(() => {});
        }
      } else {
        const failure =
          status === "cancelled" ? "The run was cancelled." : error || "The run failed without an error message.";
        patchTurn(target, (t) => ({ ...t, status, failure, finishedAt: now, question: undefined }));
      }
      forget(jobId);
    },
    [patchTurn, reconcileTrace, forget],
  );

  const handleJobDetail = useCallback(
    (jobId: string, job: JobDetail) => {
      const target = jobToTurn.current.get(jobId);
      if (!target) return;
      seenEvents.current.set(jobId, job.n_events);
      if (job.session_id) sessionToTurn.current.set(job.session_id, target);
      let question: AgentQuestion | null | undefined;
      for (const ev of job.events) {
        if (ev.type === "session" && ev.session_id) sessionToTurn.current.set(ev.session_id, target);
        if (ev.type === "approval_request") question = questionFromEvent(ev);
        if (ev.type === "approval_answered") question = null;
      }
      const pending = job.pending_approvals?.[0];
      if (pending) question = questionFromEvent(pending) ?? question;
      else if (job.pending_approvals && job.pending_approvals.length === 0 && question === undefined) question = null;
      if (job.status === "queued" || job.status === "running") {
        patchTurn(target, (t) => {
          const q = question === undefined ? t.question : (question ?? undefined);
          if (t.status === job.status && t.question === q) return t;
          return { ...t, status: job.status, question: q };
        });
      } else {
        finalize(jobId, job.status, job.result, job.error);
      }
    },
    [finalize, patchTurn],
  );

  const pollJob = useCallback(
    (jobId: string) => {
      if (pollInFlight.current.has(jobId)) return;
      pollInFlight.current.add(jobId);
      api
        .getJob(jobId, seenEvents.current.get(jobId) ?? 0)
        .then((job) => handleJobDetail(jobId, job))
        .catch((e) => {
          // 404 = the backend restarted and forgot the job; anything transient
          // (network, 5xx) is retried on the next tick.
          if (e instanceof ApiError && e.status === 404) {
            finalize(jobId, "failed", null, "The server no longer knows this job (was it restarted?). Retry to resubmit.");
          }
        })
        .finally(() => pollInFlight.current.delete(jobId));
    },
    [handleJobDetail, finalize],
  );

  // Poll every active job — also reconciles runs that finished while the tab
  // was closed, since a turn's jobId is persisted.
  useEffect(() => {
    if (!loaded) return;
    const tick = () => {
      for (const ws of actions.getState().workspaces) {
        for (const t of ws.turns) {
          if (!isRunning(t) || !t.jobId) continue;
          if (!jobToTurn.current.has(t.jobId)) jobToTurn.current.set(t.jobId, { wsId: ws.id, turnId: t.id });
          pollJob(t.jobId);
        }
      }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => clearInterval(iv);
  }, [loaded, pollJob, actions]);

  // ------------------------------------------------------- live frames

  useLiveFrames(
    useCallback(
      (frame) => {
        if (frame.channel === "job") {
          const target = jobToTurn.current.get(frame.job_id);
          if (!target) return;
          const ev = frame.event;
          if (ev?.type === "session" && ev.session_id) sessionToTurn.current.set(ev.session_id, target);
          if (ev?.type === "approval_request") {
            const q = questionFromEvent(ev);
            if (q) patchTurn(target, (t) => ({ ...t, question: q }));
          }
          if (ev?.type === "approval_answered") patchTurn(target, (t) => ({ ...t, question: undefined }));
          if (frame.status === "queued" || frame.status === "running") {
            patchTurn(target, (t) => (t.status === frame.status ? t : { ...t, status: frame.status }));
          } else {
            // terminal — confirm result/error over REST
            pollJob(frame.job_id);
          }
        } else if (frame.channel === "session") {
          const target = sessionToTurn.current.get(frame.session_id);
          if (!target) return;
          const jobId = turnById(actions.getState().workspaces.find((w) => w.id === target.wsId) as Workspace, target.turnId)?.jobId ?? "";
          appendStep(target, jobId, { kind: frame.kind, time: frame.timestamp, data: frame.data });
        }
      },
      [pollJob, patchTurn, appendStep, actions],
    ),
  );

  // ------------------------------------------------------------ actions

  const submit = useCallback(
    async (wsId: string, turn: Turn) => {
      const ws = actions.getState().workspaces.find((w) => w.id === wsId);
      if (!ws) return;
      const chain = resumeChain(ws, turn.parentId);
      try {
        const job = await api.createJob({
          task: buildTask(turn),
          method: "react",
          data_dir: turn.attachment?.data_dir ?? null,
          // ancestors only, oldest first — siblings on other branches never leak in
          resume_session_ids: chain,
        });
        const target = { wsId, turnId: turn.id };
        seenEvents.current.set(job.id, 0);
        jobToTurn.current.set(job.id, target);
        userTouched.current.set(job.id, false);
        if (job.session_id) sessionToTurn.current.set(job.session_id, target);
        patchTurn(target, (t) => ({ ...t, jobId: job.id, status: job.status, failure: undefined }));
      } catch (e) {
        const failure = e instanceof Error ? e.message : "Failed to submit the job.";
        patchTurn({ wsId, turnId: turn.id }, (t) => ({ ...t, status: "failed", failure }));
      }
    },
    [actions, patchTurn],
  );

  const ask = useCallback(
    (wsId: string, input: AskInput): Turn | null => {
      const ws = actions.getState().workspaces.find((w) => w.id === wsId);
      if (!ws) return null;
      if (activeTurn(ws)) return null; // one job per workspace at a time
      const turn = makeTurn(input);
      actions.update(wsId, (w) => setFocus(upsertTurn(w, turn), { kind: "turn", turnId: turn.id }));
      void submit(wsId, turn);
      return turn;
    },
    [actions, submit],
  );

  const retry = useCallback(
    (wsId: string, turnId: string) => {
      const ws = actions.getState().workspaces.find((w) => w.id === wsId);
      const turn = turnById(ws, turnId);
      if (!ws || !turn || activeTurn(ws)) return;
      const fresh: Turn = {
        ...turn,
        jobId: null,
        sessionId: null,
        status: "queued",
        steps: [],
        artifacts: emptyArtifacts(),
        answer: undefined,
        outcome: undefined,
        failure: undefined,
        question: undefined,
        startedAt: Date.now() / 1000,
        finishedAt: undefined,
      };
      actions.update(wsId, (w) => setFocus(updateTurn(w, turnId, () => fresh), { kind: "turn", turnId }));
      void submit(wsId, fresh);
    },
    [actions, submit],
  );

  const stop = useCallback(
    (wsId: string, turnId: string) => {
      const ws = actions.getState().workspaces.find((w) => w.id === wsId);
      const turn = turnById(ws, turnId);
      if (!turn?.jobId) return;
      api.cancelJob(turn.jobId).catch((e) => {
        toast("error", e instanceof Error ? e.message : "Failed to cancel the run");
      });
    },
    [actions, toast],
  );

  const answer = useCallback(
    async (wsId: string, turnId: string, text: string) => {
      const ws = actions.getState().workspaces.find((w) => w.id === wsId);
      const turn = turnById(ws, turnId);
      if (!turn?.jobId || !turn.question) return;
      try {
        await api.approveJob(turn.jobId, turn.question.requestId, text);
        patchTurn({ wsId, turnId }, (t) => ({ ...t, question: undefined }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          toast("info", "That question timed out and the agent took its default answer.");
          patchTurn({ wsId, turnId }, (t) => ({ ...t, question: undefined }));
        } else {
          toast("error", e instanceof Error ? e.message : "Failed to send the answer");
        }
      }
    },
    [actions, patchTurn, toast],
  );

  const noteUserFocus = useCallback(
    (wsId: string) => {
      const ws = actions.getState().workspaces.find((w) => w.id === wsId);
      const t = ws ? activeTurn(ws) : undefined;
      if (t?.jobId) userTouched.current.set(t.jobId, true);
    },
    [actions],
  );

  const value = useMemo<RunnerApi>(() => ({ ask, retry, stop, answer, noteUserFocus }), [ask, retry, stop, answer, noteUserFocus]);

  return <RunnerContext.Provider value={value}>{children}</RunnerContext.Provider>;
}

export function useRunner(): RunnerApi {
  const r = useContext(RunnerContext);
  if (!r) throw new Error("useRunner must be used inside <RunnerProvider>");
  return r;
}
