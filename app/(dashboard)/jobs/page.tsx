"use client";

/**
 * Jobs list (docs/guide.md §8.1): a dense table — status dot, method badge,
 * task, elapsed, created — refreshed live from /ws/live job frames with REST
 * as the fallback. "New run" opens the one-shot form in a right drawer
 * (`?new=1`, the target of the old /run route).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type JobEvent, type JobSummary } from "@/lib/api";
import { formatMetric, timeAgo } from "@/lib/format";
import { useLiveFrames } from "@/lib/live";
import { NewRunForm } from "@/components/new-run-form";
import {
  Button,
  CellText,
  Drawer,
  Elapsed,
  EmptyNote,
  ErrorNote,
  ListIcon,
  Loading,
  MethodBadge,
  PageFrame,
  PlusIcon,
  RefreshIcon,
  SectionLabel,
  SkeletonRows,
  TABLE,
  TD,
  TH,
  TableWrap,
} from "@/components/ui";

const STATUS_DOT: Record<string, { cls: string; label: string }> = {
  queued: { cls: "bg-faint", label: "queued" },
  running: { cls: "bg-accent animate-pulse motion-reduce:animate-none", label: "running" },
  complete: { cls: "bg-ok", label: "complete" },
  failed: { cls: "bg-err", label: "failed" },
  cancelled: { cls: "bg-warn", label: "cancelled" },
};

export function StatusDot({ status }: { status: string }) {
  const s = STATUS_DOT[status] ?? STATUS_DOT.queued;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-11 text-muted" title={s.label}>
      <span className={`h-2 w-2 rounded-full ${s.cls}`} aria-hidden />
      {s.label}
    </span>
  );
}

function eventSnippet(e: JobEvent | null): string {
  if (!e) return "";
  switch (e.type) {
    case "status":
      return e.error ? `${e.status} — ${e.error}` : e.status ?? "";
    case "session":
      return `session ${e.session_id?.slice(0, 8)} started`;
    case "node":
      return `node ${e.step} [${e.stage}] metric=${formatMetric(e.metric)} best=${formatMetric(e.best_metric)}${e.is_buggy ? " (buggy)" : ""}`;
    case "cancel_requested":
      return "cancel requested";
    case "approval_request":
      return `asking: ${e.question ?? "a question"}`;
    case "progress":
      return e.message ?? "progress";
    default:
      return e.type;
  }
}

function JobsList() {
  const router = useRouter();
  const search = useSearchParams();
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshQueued = useRef(false);
  const drawerOpen = search.get("new") === "1";

  const load = useCallback(
    () =>
      api
        .listJobs()
        .then((r) => {
          setJobs(r.jobs);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  // refetch promptly (debounced) when any job frame arrives on the socket
  useLiveFrames((frame) => {
    if (frame.channel !== "job" || refreshQueued.current) return;
    refreshQueued.current = true;
    setTimeout(() => {
      refreshQueued.current = false;
      void load();
    }, 400);
  });

  const setDrawer = (open: boolean) => router.replace(open ? "/jobs?new=1" : "/jobs");

  return (
    <PageFrame>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionLabel>Jobs</SectionLabel>
          <p className="mt-0.5 text-12 text-muted">Every submitted run, newest first. The list updates live over the websocket.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={refresh} loading={refreshing}>
            <RefreshIcon size={13} />
            Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={() => setDrawer(true)}>
            <PlusIcon size={13} />
            New run
          </Button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {jobs === null && !error && <SkeletonRows rows={6} />}
      {jobs !== null && jobs.length === 0 && (
        <EmptyNote
          icon={<ListIcon size={26} />}
          title="No jobs yet"
          hint="Jobs appear here as soon as a workspace turn or a one-shot run starts."
          action={
            <Button size="sm" variant="primary" onClick={() => setDrawer(true)}>
              Start a run
            </Button>
          }
        />
      )}

      {jobs !== null && jobs.length > 0 && (
        <TableWrap maxHeight="calc(100vh - 10rem)">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Status</th>
                <th className={TH}>Method</th>
                <th className={TH}>Task</th>
                <th className={TH}>Elapsed</th>
                <th className={TH}>Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const running = job.status === "queued" || job.status === "running";
                return (
                  <tr
                    key={job.id}
                    className="cursor-pointer bg-panel transition-colors hover:bg-hover"
                    onClick={() => router.push(`/jobs/${job.id}`)}
                  >
                    <td className={TD}>
                      <StatusDot status={job.status} />
                    </td>
                    <td className={TD}>
                      <MethodBadge method={job.method} />
                    </td>
                    <td className={TD}>
                      <CellText width="min(40rem, 50vw)">
                        <Link href={`/jobs/${job.id}`} className="text-13 text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                          {job.task}
                        </Link>
                      </CellText>
                      <CellText width="min(40rem, 50vw)" className="font-mono text-11 text-faint">
                        {eventSnippet(job.last_event) || `${job.n_events} events`}
                      </CellText>
                    </td>
                    <td className={`${TD} font-mono text-11 ${running ? "text-accent" : "text-muted"}`}>
                      <Elapsed from={job.started} to={job.finished} />
                    </td>
                    <td className={`${TD} text-11 text-faint`}>{timeAgo(job.created)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawer(false)} title="New run" width="min(44rem, 92vw)">
        {drawerOpen && (
          <NewRunForm
            onSubmitted={(id) => {
              router.push(`/jobs/${id}`);
            }}
          />
        )}
      </Drawer>
    </PageFrame>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<Loading label="Loading jobs…" />}>
      <JobsList />
    </Suspense>
  );
}
