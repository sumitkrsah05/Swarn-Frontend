/**
 * Build turns / workspaces from server records (docs/guide.md §8.1–8.2):
 * a completed session trace becomes one turn whose cards come from the
 * trace's artifacts (structured, or the parse fallback).
 */

import type { JobDetail, SessionDetail, SessionStep } from "./api";
import { artifactsFromSteps } from "./artifacts";
import { STEPS_CAP, titleFrom, type Turn, type TurnStatus, type Workspace } from "./workspace";

/** Strip the data-directory note the server appends to a task. */
export function promptFromTask(task: string): string {
  return task.replace(/\n\nData files for this task are in the workspace directory '[^']+':[^\n]*$/, "").trim();
}

function statusFromOutcome(outcome: string | null | undefined): TurnStatus {
  if (!outcome) return "complete";
  if (outcome === "complete") return "complete";
  if (outcome === "cancelled") return "cancelled";
  return "failed";
}

export function turnFromSteps(init: {
  id?: string;
  prompt: string;
  steps: SessionStep[];
  sessionId?: string | null;
  jobId?: string | null;
  answer?: string | null;
  outcome?: string | null;
  startedAt?: number;
  finishedAt?: number | null;
  status?: TurnStatus;
}): Turn {
  const steps = init.steps.slice(-STEPS_CAP);
  const status = init.status ?? statusFromOutcome(init.outcome);
  const complete = init.steps.find((s) => s.kind === "complete");
  const answer = init.answer ?? (typeof complete?.data.summary === "string" ? complete.data.summary : undefined);
  return {
    id: init.id ?? crypto.randomUUID(),
    parentId: null,
    prompt: init.prompt,
    jobId: init.jobId ?? null,
    sessionId: init.sessionId ?? null,
    status,
    steps,
    artifacts: artifactsFromSteps(init.steps),
    answer: answer ?? undefined,
    outcome: init.outcome ?? undefined,
    failure: status === "failed" ? `The run ended with outcome "${init.outcome}".` : status === "cancelled" ? "The run was cancelled." : undefined,
    startedAt: init.startedAt ?? Date.now() / 1000,
    finishedAt: init.finishedAt ?? undefined,
  };
}

export function turnFromSession(session: SessionDetail): Turn {
  return turnFromSteps({
    id: `session-${session.id}`,
    prompt: promptFromTask(session.task),
    steps: session.steps,
    sessionId: session.id,
    answer: session.summary,
    outcome: session.outcome,
    startedAt: session.started_at,
    finishedAt: session.ended_at,
  });
}

/** A one-turn workspace from a session, focused on its answer. */
export function workspaceFromSession(session: SessionDetail, name?: string): Workspace {
  const turn = turnFromSession(session);
  turn.id = crypto.randomUUID();
  const now = Date.now() / 1000;
  return {
    id: crypto.randomUUID(),
    name: name ?? titleFrom(turn.prompt),
    createdAt: session.started_at || now,
    updatedAt: now,
    turns: [turn],
    focus: turn.answer ? { kind: "answer", turnId: turn.id } : null,
    unread: [],
    hiddenDatasets: [],
  };
}

/** A read-only workspace for a react/team job page (live steps until the trace exists). */
export function workspaceFromJob(job: JobDetail, steps: SessionStep[]): Workspace {
  const running = job.status === "queued" || job.status === "running";
  const turn = turnFromSteps({
    id: `job-${job.id}`,
    prompt: promptFromTask(job.task),
    steps,
    sessionId: job.session_id,
    jobId: job.id,
    answer: typeof job.result?.summary === "string" ? job.result.summary : undefined,
    outcome: typeof job.result?.outcome === "string" ? job.result.outcome : undefined,
    startedAt: job.started ?? job.created,
    finishedAt: job.finished,
    status: running ? job.status : job.status === "complete" ? "complete" : job.status === "cancelled" ? "cancelled" : "failed",
  });
  if (job.status === "failed") turn.failure = job.error ?? "The run failed without an error message.";
  const now = Date.now() / 1000;
  return {
    id: `job-${job.id}`,
    name: titleFrom(turn.prompt),
    createdAt: job.created,
    updatedAt: now,
    turns: [turn],
    focus: null,
    unread: [],
    hiddenDatasets: [],
  };
}
