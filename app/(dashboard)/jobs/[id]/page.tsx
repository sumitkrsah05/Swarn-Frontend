"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  ApiError,
  type JobDetail,
  type JobEvent,
  type SessionStep,
} from "@/lib/api";
import {
  formatDuration,
  formatMetric,
  formatTime,
} from "@/lib/format";
import { useLiveFrames } from "@/lib/live";
import { useToast } from "@/components/toast";
import { StepTimeline } from "@/components/step-timeline";
import { Markdown } from "@/components/markdown";
import {
  ErrorNote,
  MethodBadge,
  Spinner,
  StatusBadge,
} from "@/components/ui";

const MAX_RENDERED = 500;

function isTerminal(status: string | undefined): boolean {
  return status === "complete" || status === "failed" || status === "cancelled";
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<SessionStep[]>([]);
  const [trace, setTrace] = useState<SessionStep[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [, forceTick] = useState(0);

  const cursor = useRef(0);
  const polling = useRef(false);
  const jobRef = useRef<JobDetail | null>(null);
  jobRef.current = job;

  /** Poll GET /api/jobs/{id}?since=N — authoritative event stream (the ws has
   *  no history replay), also used for state on load and after reconnects. */
  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const d = await api.getJob(id, cursor.current);
      cursor.current = d.n_events;
      setJob(d);
      setLoadError(null);
      if (d.events.length > 0) {
        setEvents((prev) => [...prev, ...d.events].slice(-MAX_RENDERED));
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setLoadError(`Job ${id} was not found.`);
      } else {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      polling.current = false;
    }
  }, [id]);

  useEffect(() => {
    poll();
    const t = setInterval(() => {
      if (!isTerminal(jobRef.current?.status)) poll();
    }, 3000);
    return () => clearInterval(t);
  }, [poll]);

  // elapsed-time ticker while running
  useEffect(() => {
    if (!job || isTerminal(job.status)) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [job]);

  // live frames: job frames → prompt refetch; session frames → timeline
  const pollQueued = useRef(false);
  useLiveFrames((frame) => {
    const current = jobRef.current;
    if (frame.channel === "job" && frame.job_id === id) {
      if (!pollQueued.current) {
        pollQueued.current = true;
        setTimeout(() => {
          pollQueued.current = false;
          poll();
        }, 250);
      }
    } else if (
      frame.channel === "session" &&
      current?.session_id &&
      frame.session_id === current.session_id
    ) {
      setLiveSteps((prev) =>
        [...prev, { kind: frame.kind, time: frame.timestamp, data: frame.data }]
          .slice(-MAX_RENDERED),
      );
    }
  });

  // once a react/team job finishes, swap the (possibly partial) live feed for
  // the full persisted trace
  useEffect(() => {
    if (!job || !isTerminal(job.status) || !job.session_id || trace) return;
    api
      .getSession(job.session_id)
      .then((s) => setTrace(s.steps.slice(-MAX_RENDERED)))
      .catch(() => {});
  }, [job, trace]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const res = await api.cancelJob(id);
      if (res.note) toast("info", res.note);
      else toast("success", "Cancel requested");
      poll();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  if (loadError && !job) return <ErrorNote message={loadError} />;
  if (!job) return <Spinner label="Loading job…" />;

  const nodeEvents = events.filter((e) => e.type === "node");
  const bestMetric = nodeEvents.reduce<number | null>(
    (best, e) => (e.best_metric != null ? e.best_metric : best),
    null,
  );
  const elapsed =
    job.started != null
      ? (job.finished ?? Date.now() / 1000) - job.started
      : null;
  const steps = trace ?? liveSteps;
  const running = !isTerminal(job.status);

  return (
    <div>
      {/* header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={job.status} />
          <MethodBadge method={job.method} />
          <span className="font-mono text-xs text-faint">job {job.id}</span>
          {running && job.status !== "queued" && (
            <button
              onClick={cancel}
              disabled={cancelling || job.cancel_requested}
              className="ml-auto rounded-md border border-err/40 px-3 py-1 text-xs text-err hover:bg-err/10 disabled:opacity-40"
            >
              {job.cancel_requested
                ? "Cancel requested…"
                : cancelling
                  ? "Cancelling…"
                  : "Cancel"}
            </button>
          )}
        </div>
        <h1 className="mt-3 whitespace-pre-wrap text-lg font-medium leading-snug text-fg">
          {job.task}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
          <span>created {formatTime(job.created)}</span>
          {job.started != null && <span>started {formatTime(job.started)}</span>}
          {elapsed != null && (
            <span className={running ? "text-accent" : undefined}>
              elapsed {formatDuration(elapsed)}
            </span>
          )}
          {bestMetric != null && (
            <span className="text-ok">best metric {formatMetric(bestMetric)}</span>
          )}
        </div>
        {loadError && (
          <div className="mt-3">
            <ErrorNote message={loadError} />
          </div>
        )}
      </div>

      {/* failure */}
      {job.status === "failed" && job.error && (
        <div className="mb-6">
          <ErrorNote message={job.error} />
        </div>
      )}

      {/* result card */}
      {job.status === "complete" && job.result && (
        <section className="mb-6 rounded-lg border border-ok/40 bg-ok/5 p-4">
          <h2 className="mb-2 text-sm font-semibold text-ok">Result</h2>
          {job.method === "aide" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm">
                <span className="text-muted">
                  best metric{" "}
                  <span className="text-fg">
                    {formatMetric(job.result.best_metric)}
                  </span>
                </span>
                <span className="text-muted">
                  nodes explored{" "}
                  <span className="text-fg">{job.result.steps_done ?? "—"}</span>
                </span>
              </div>
              {job.result.run_id && (
                <div className="flex gap-3 pt-1">
                  <Link
                    href={`/runs/${job.result.run_id}`}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
                  >
                    Open run report &amp; artifacts →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(job.result.summary || job.result.final_outcome) && (
                <p className="whitespace-pre-wrap text-sm text-fg">
                  {job.result.summary ?? job.result.final_outcome}
                </p>
              )}
              {job.result.report_markdown && (
                <div className="rounded-md border border-edge bg-panel p-4">
                  <Markdown>{job.result.report_markdown}</Markdown>
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                {job.session_id && (
                  <Link
                    href={`/sessions/${job.session_id}`}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
                  >
                    Full session trace →
                  </Link>
                )}
                <Link
                  href="/workspace"
                  className="rounded-md border border-edge px-3 py-1.5 text-xs text-fg hover:bg-hover"
                >
                  Browse workspace →
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {/* cancelled note */}
      {job.status === "cancelled" && (
        <div className="mb-6 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          This run was cancelled.
        </div>
      )}

      {/* AIDE node progress feed */}
      {job.method === "aide" && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-fg">
            Search progress{" "}
            <span className="font-mono text-xs font-normal text-faint">
              {nodeEvents.length} node(s)
            </span>
          </h2>
          {nodeEvents.length === 0 ? (
            <p className="text-sm text-muted">
              {running ? "Waiting for the first node…" : "No node events."}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-edge">
              {[...nodeEvents].reverse().map((e, i) => (
                <div
                  key={nodeEvents.length - i}
                  className="flex items-center gap-3 border-b border-edge bg-panel px-3 py-2 font-mono text-xs last:border-b-0"
                >
                  <span className="w-14 shrink-0 text-faint">#{e.step}</span>
                  <span className="w-16 shrink-0 text-violet">{e.stage}</span>
                  <span
                    className={`w-16 shrink-0 ${e.is_buggy ? "text-err" : "text-ok"}`}
                  >
                    {e.is_buggy ? "buggy" : "good"}
                  </span>
                  <span className="w-28 shrink-0 text-muted">
                    metric {formatMetric(e.metric)}
                  </span>
                  <span className="w-28 shrink-0 text-ok">
                    best {formatMetric(e.best_metric)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-faint">
                    {e.note ?? ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* session step timeline (react / team) */}
      {job.method !== "aide" && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-fg">
            Agent steps{" "}
            <span className="font-mono text-xs font-normal text-faint">
              {steps.length} step(s)
              {trace ? " · full trace" : running ? " · live" : ""}
            </span>
          </h2>
          {steps.length === 0 ? (
            <p className="text-sm text-muted">
              {running
                ? job.session_id
                  ? "Waiting for steps…"
                  : "Waiting for the session to start…"
                : "No steps captured on this page. The full trace is available once the session is persisted."}
            </p>
          ) : (
            <StepTimeline steps={steps} />
          )}
        </section>
      )}
    </div>
  );
}
