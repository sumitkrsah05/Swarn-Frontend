"use client";

/**
 * Job detail (docs/guide.md §8.1). REST (GET /api/jobs/{id}?since=N) is the
 * authority; /ws/live job frames trigger a debounced refetch and session
 * frames feed the live step list until the persisted trace replaces it.
 *
 *  - react / team jobs render their steps with the workspace's thread
 *    components (thinking banner, table / chart / report cards) and can be
 *    imported as a new workspace with one turn
 *  - AIDE jobs render node events as a thread of attempt cards
 *  - eval jobs keep the progress log
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, type JobDetail, type JobEvent, type SessionDetail, type SessionStep } from "@/lib/api";
import { formatMetric, formatTime } from "@/lib/format";
import { useLiveFrames } from "@/lib/live";
import { workspaceFromJob, workspaceFromSession } from "@/lib/workspace-import";
import { uid } from "@/lib/workspace";
import { useToast } from "@/components/toast";
import { Markdown } from "@/components/markdown";
import { OpenInWorkspaceButton, StaticThread } from "@/components/workspace/static-thread";
import { AideAttempts } from "@/components/jobs/aide-attempts";
import { ApprovalCard, pendingQuestions } from "@/components/jobs/approval-card";
import { StatusDot } from "@/components/jobs/status-dot";
import { JobMonitor } from "@/components/evals/job-monitor";
import { Banner, Button, Elapsed, EmptyNote, ErrorNote, Loading, MethodBadge, SectionLabel, TintCard } from "@/components/ui";

const MAX_RENDERED = 500;

function isTerminal(status: string | undefined): boolean {
  return status === "complete" || status === "failed" || status === "cancelled";
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<SessionStep[]>([]);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const cursor = useRef(0);
  const polling = useRef(false);
  const jobRef = useRef<JobDetail | null>(null);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  /** Poll GET /api/jobs/{id}?since=N — the authoritative event stream. */
  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const d = await api.getJob(id, cursor.current);
      cursor.current = d.n_events;
      setJob(d);
      setLoadError(null);
      if (d.events.length > 0) setEvents((prev) => [...prev, ...d.events].slice(-MAX_RENDERED));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setLoadError(`Job ${id} was not found — the server may have restarted.`);
      else setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      polling.current = false;
    }
  }, [id]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => {
      if (!isTerminal(jobRef.current?.status)) void poll();
    }, 3000);
    return () => clearInterval(t);
  }, [poll]);

  // live frames: job frames → debounced refetch; session frames → live steps
  const pollQueued = useRef(false);
  useLiveFrames((frame) => {
    const current = jobRef.current;
    if (frame.channel === "job" && frame.job_id === id) {
      if (!pollQueued.current) {
        pollQueued.current = true;
        setTimeout(() => {
          pollQueued.current = false;
          void poll();
        }, 250);
      }
    } else if (frame.channel === "session" && current?.session_id && frame.session_id === current.session_id) {
      setLiveSteps((prev) => [...prev, { kind: frame.kind, time: frame.timestamp, data: frame.data }].slice(-MAX_RENDERED));
    }
  });

  // once a react/team job finishes, swap the (possibly partial) live feed for the persisted trace
  useEffect(() => {
    if (!job || !isTerminal(job.status) || !job.session_id || session) return;
    api
      .getSession(job.session_id)
      .then((s) => {
        if (Array.isArray(s.steps)) setSession(s);
      })
      .catch(() => {});
  }, [job, session]);

  const cancel = async () => {
    setCancelling(true);
    try {
      const res = await api.cancelJob(id);
      if (res.note) toast("info", res.note);
      else toast("success", "Cancel requested");
      void poll();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  const steps = useMemo(() => session?.steps.slice(-MAX_RENDERED) ?? liveSteps, [session, liveSteps]);
  // lib/api.ts types Method as react | aide | team; eval jobs exist too (api/types.ts)
  const method: string = job?.method ?? "";
  const isAgent = !!job && method !== "aide" && method !== "eval";
  const threadWs = useMemo(() => (job && isAgent ? workspaceFromJob(job, steps) : null), [job, isAgent, steps]);

  if (loadError && !job) {
    return (
      <div className="p-6">
        <ErrorNote message={loadError} />
        <Link href="/jobs" className="mt-3 inline-block text-12 text-accent hover:underline">
          ← Back to jobs
        </Link>
      </div>
    );
  }
  if (!job) return <Loading label="Loading job…" />;

  const running = !isTerminal(job.status);
  const nodeEvents = events.filter((e) => e.type === "node");
  const bestMetric = nodeEvents.reduce<number | null>((best, e) => (e.best_metric != null ? e.best_metric : best), null);
  const questions = running ? pendingQuestions(events) : [];

  const header = (
    <header className="shrink-0 border-b border-edge bg-panel px-4 py-2.5 sm:px-5">
      <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-11">
        <Link href="/jobs" className="text-muted hover:text-fg">
          Jobs
        </Link>
        <span className="text-faint" aria-hidden>
          /
        </span>
        <span className="font-mono text-fg">{job.id}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusDot status={job.status} />
        <MethodBadge method={job.method} />
        <h1 className="min-w-0 flex-1 basis-[16rem] truncate text-13 font-medium text-fg" title={job.task}>
          {job.task}
        </h1>
        <span className="flex flex-wrap items-center gap-x-3 font-mono text-11 text-muted">
          <span title={`created ${formatTime(job.created)}`}>created {formatTime(job.created)}</span>
          {job.started != null && <span>started {formatTime(job.started)}</span>}
          <span className={running ? "text-accent" : undefined}>
            elapsed <Elapsed from={job.started} to={job.finished} />
          </span>
          {bestMetric != null && <span className="text-ok">best {formatMetric(bestMetric)}</span>}
        </span>
        <span className="flex items-center gap-2">
          {running && job.status !== "queued" && (
            <Button variant="danger" size="sm" onClick={cancel} loading={cancelling} disabled={job.cancel_requested}>
              {job.cancel_requested ? "Cancel requested…" : "Cancel"}
            </Button>
          )}
          {isAgent && (
            <OpenInWorkspaceButton
              jobId={job.id}
              sessionId={job.session_id}
              build={() => {
                if (session) return workspaceFromSession(session);
                const ws = workspaceFromJob(job, steps);
                return { ...ws, id: uid(), turns: ws.turns.map((t) => ({ ...t, id: uid() })) };
              }}
            />
          )}
          {job.method === "aide" && job.status === "complete" && job.result?.run_id && (
            <Link href={`/runs/${encodeURIComponent(job.result.run_id)}`} className="inline-flex h-7 items-center rounded-md bg-accent px-2.5 text-12 font-medium text-on-accent transition-colors hover:opacity-90">
              Open run report and artifacts →
            </Link>
          )}
        </span>
      </div>
      {loadError && (
        <div className="mt-2">
          <Banner tone="warn" className="py-1.5 text-12">
            {loadError} — retrying.
          </Banner>
        </div>
      )}
    </header>
  );

  const notices = (
    <>
      {job.status === "failed" && job.error && <ErrorNote message={job.error} />}
      {job.status === "cancelled" && <Banner tone="warn">This run was cancelled.</Banner>}
      {questions.map((q) => (
        <ApprovalCard key={q.requestId} jobId={job.id} q={q} onAnswered={() => void poll()} />
      ))}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}

      {isAgent && threadWs && (
        <div className="flex min-h-0 flex-1 flex-col">
          {(job.status === "failed" || job.status === "cancelled" || questions.length > 0) && (
            <div className="shrink-0 space-y-2 px-4 pt-3 sm:px-5">{notices}</div>
          )}
          <div className="min-h-0 flex-1">
            <StaticThread ws={threadWs} />
          </div>
        </div>
      )}

      {job.method === "aide" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mx-auto max-w-4xl space-y-4">
            {notices}
            {job.status === "complete" && job.result && (
              <TintCard role="ok" radius="panel" className="px-4 py-3">
                <SectionLabel className="mb-1">Result</SectionLabel>
                <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-12">
                  <span className="text-muted">
                    best metric <span className="text-fg">{formatMetric(job.result.best_metric)}</span>
                  </span>
                  <span className="text-muted">
                    nodes explored <span className="text-fg">{job.result.steps_done ?? "—"}</span>
                  </span>
                  {typeof job.result.stopped_because === "string" && <span className="text-faint">stopped: {job.result.stopped_because}</span>}
                </div>
              </TintCard>
            )}
            <AideAttempts nodes={nodeEvents} bestMetric={bestMetric} running={running} />
          </div>
        </div>
      )}

      {method === "eval" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mx-auto max-w-4xl space-y-4">
            {notices}
            <div className="rounded-canvas border border-edge bg-panel p-4">
              <JobMonitor jobId={job.id} compact />
            </div>
            {job.result?.report_markdown && (
              <div className="rounded-canvas border border-edge bg-panel p-4">
                <Markdown>{job.result.report_markdown as string}</Markdown>
              </div>
            )}
          </div>
        </div>
      )}

      {!isAgent && method !== "aide" && method !== "eval" && (
        <EmptyNote title={`Unknown job method "${job.method}"`} hint="This page knows react, team, aide and eval jobs." />
      )}
    </div>
  );
}
