"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { deleteRun, resumeRun } from "@/api/client";
import type { JobSummary } from "@/api/types";
import { useInvalidateRuns, useMetricsCatalog, useRun } from "@/hooks/useEvalData";
import { useToast } from "@/components/toast";
import { formatTime } from "@/lib/format";
import { errorMessage, truncate } from "@/lib/evals";
import {
  Button,
  ConfirmButton,
  GatesBadge,
  InlineError,
  JobStatusBadge,
  Loading,
  RunStatusBadge,
  Tabs,
  Card,
} from "@/components/evals/primitives";
import { JobMonitor } from "@/components/evals/job-monitor";
import { RunOverview } from "@/components/evals/run-overview";
import { RunSlices } from "@/components/evals/run-slices";
import { RunComparisons } from "@/components/evals/run-comparisons";
import { RunResults } from "@/components/evals/run-results";
import { RunReport } from "@/components/evals/run-report";
import { RunJudge } from "@/components/evals/run-judge";
import { RunFiles } from "@/components/evals/run-files";

type TabId = "overview" | "slices" | "comparisons" | "results" | "report" | "judge" | "files";
const TAB_IDS: TabId[] = ["overview", "slices", "comparisons", "results", "report", "judge", "files"];

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  return (
    <Suspense fallback={<Loading label="Loading run…" />}>
      <RunDetail runId={decodeURIComponent(runId)} />
    </Suspense>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const invalidate = useInvalidateRuns();

  const requested = search.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>(requested && TAB_IDS.includes(requested) ? requested : "overview");
  const [liveJob, setLiveJob] = useState<JobSummary | null>(null);

  const run = useRun(runId, { live: !!liveJob });
  const catalog = useMetricsCatalog();

  const job = liveJob ?? run.data?.job ?? null;
  const jobLive = !!job && (job.status === "running" || job.status === "queued");

  const del = useMutation({
    mutationFn: () => deleteRun(runId),
    onSuccess: () => {
      toast("success", `Deleted run ${runId}`);
      invalidate();
      router.push("/evals");
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const resume = useMutation({
    mutationFn: (add?: number) => resumeRun(runId, add != null ? { add } : {}),
    onSuccess: (j) => {
      toast("success", `Resumed as job ${j.id}`);
      setLiveJob(j);
      invalidate(runId);
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  if (run.isError) {
    return (
      <div className="space-y-3">
        <InlineError message={errorMessage(run.error)} />
        <Link href="/evals" className="text-sm text-accent">← Back to runs</Link>
      </div>
    );
  }
  if (run.isPending) return <Loading label="Loading run…" />;
  const r = run.data;
  const s = r.summary;
  const hasJudge = !!s?.judge_diagnostics && Object.keys(s.judge_diagnostics).length > 0;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link href="/evals" className="text-muted hover:text-fg">Evaluations</Link>
          <span className="text-faint">/</span>
          <span className="font-mono text-fg">{r.run_id}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RunStatusBadge status={r.status} />
          <GatesBadge passed={s?.gates_passed} />
          {job && <JobStatusBadge status={job.status} />}
          {s?.generated_at != null && (
            <span className="font-mono text-xs text-muted">
              {typeof s.generated_at === "number" ? formatTime(s.generated_at) : s.generated_at}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              href={`/evals/compare?run=${encodeURIComponent(r.run_id)}`}
              className="rounded-md border border-edge px-3 py-1.5 text-xs text-fg hover:bg-hover"
            >
              Compare with…
            </Link>
            {r.status === "incomplete" && !jobLive && (
              <Button variant="primary" size="sm" loading={resume.isPending} onClick={() => resume.mutate(undefined)}>
                Resume
              </Button>
            )}
            <ConfirmButton
              label="Delete"
              confirmLabel="Delete run"
              disabled={jobLive}
              loading={del.isPending}
              title={jobLive ? "A job is still producing this run" : undefined}
              onConfirm={() => del.mutate()}
            />
          </div>
        </div>
        <h1 className="text-lg font-medium leading-snug text-fg" title={s?.goal ?? r.config?.goal ?? ""}>
          {truncate(s?.goal ?? r.config?.goal ?? "(no goal)", 240)}
        </h1>
      </header>

      {job && (jobLive || liveJob) && (
        <Card title="Job" subtitle="this run is being produced right now">
          <JobMonitor
            jobId={job.id}
            compact
            onNewJob={(j) => setLiveJob(j)}
          />
        </Card>
      )}

      <Tabs<TabId>
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "slices", label: "Slices" },
          { id: "comparisons", label: "Comparisons" },
          { id: "results", label: "Results" },
          { id: "report", label: "Report" },
          { id: "judge", label: "Judge", hidden: !hasJudge },
          { id: "files", label: "Files" },
        ]}
      />

      {tab === "overview" && (
        <RunOverview
          run={r}
          catalog={catalog.data?.metrics}
          onResume={(add) => resume.mutate(add)}
          resuming={resume.isPending}
          onGoToJudge={() => setTab("judge")}
        />
      )}
      {tab === "slices" && <RunSlices summary={s} />}
      {tab === "comparisons" && <RunComparisons summary={s} />}
      {tab === "results" && <RunResults run={r} catalog={catalog.data?.metrics} />}
      {tab === "report" && <RunReport run={r} />}
      {tab === "judge" && <RunJudge run={r} catalog={catalog.data?.metrics} />}
      {tab === "files" && <RunFiles runId={r.run_id} />}
    </div>
  );
}
