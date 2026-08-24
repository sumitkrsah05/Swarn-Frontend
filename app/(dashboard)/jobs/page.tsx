"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type JobEvent, type JobSummary } from "@/lib/api";
import { formatMetric, timeAgo } from "@/lib/format";
import { useLiveFrames } from "@/lib/live";
import {
  EmptyState,
  ErrorNote,
  MethodBadge,
  PageHeader,
  Spinner,
  StatusBadge,
} from "@/components/ui";

function eventSnippet(e: JobEvent | null): string {
  if (!e) return "";
  switch (e.type) {
    case "status":
      return e.error ? `status: ${e.status} — ${e.error}` : `status: ${e.status}`;
    case "session":
      return `session ${e.session_id?.slice(0, 8)} started`;
    case "node":
      return `node ${e.step} [${e.stage}] metric=${formatMetric(e.metric)} best=${formatMetric(e.best_metric)}${e.is_buggy ? " (buggy)" : ""}`;
    case "cancel_requested":
      return "cancel requested";
    default:
      return e.type;
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshQueued = useRef(false);

  const refresh = useCallback(() => {
    api
      .listJobs()
      .then((r) => {
        setJobs(r.jobs);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  // refetch promptly (debounced) when any job frame arrives on the socket
  useLiveFrames((frame) => {
    if (frame.channel !== "job" || refreshQueued.current) return;
    refreshQueued.current = true;
    setTimeout(() => {
      refreshQueued.current = false;
      refresh();
    }, 400);
  });

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="All submitted runs, newest first. Updates live."
      />

      {error && <ErrorNote message={error} />}
      {jobs === null && !error && <Spinner label="Loading jobs…" />}
      {jobs !== null && jobs.length === 0 && (
        <EmptyState
          title="No jobs yet"
          hint="Start one from the New Run page."
        />
      )}

      {jobs !== null && jobs.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-edge">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="flex items-center gap-4 border-b border-edge bg-panel px-4 py-3 last:border-b-0 hover:bg-hover"
            >
              <StatusBadge status={job.status} />
              <MethodBadge method={job.method} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{job.task}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-faint">
                  {eventSnippet(job.last_event) || `${job.n_events} events`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-xs text-muted">
                  {job.id.slice(0, 8)}
                </div>
                <div className="mt-0.5 text-xs text-faint">
                  {timeAgo(job.created)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
