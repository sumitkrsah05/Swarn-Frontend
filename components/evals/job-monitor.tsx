"use client";

/**
 * Live view of one eval job (wizard step 3 and the run page while a job is
 * producing the run): status, elapsed time, progress log, cancel, and the
 * terminal-state cards (result / failure / cancelled → resume).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { cancelJob, resumeRun } from "@/api/client";
import type { EvalJobResult, JobSummary } from "@/api/types";
import { useJob } from "@/hooks/useJob";
import { useToast } from "@/components/toast";
import { formatClock } from "@/lib/format";
import {
  errorMessage,
  fmtNum,
  fmtPct,
  fmtUsd,
  isMockName,
  listYamlModels,
  mentionsHiddenReasoning,
  orderCandidates,
  type YamlModelRef,
} from "@/lib/evals";
import {
  Badge,
  Banner,
  Button,
  Card,
  Elapsed,
  GatesBadge,
  InlineError,
  JobStatusBadge,
  PassBadge,
  Select,
} from "./primitives";

export function JobMonitor({
  jobId,
  yaml,
  onApplyThinkingFix,
  onBackToReview,
  onNewJob,
  compact,
}: {
  jobId: string;
  /** current YAML (wizard) — enables the one-click hidden-reasoning fix */
  yaml?: string;
  onApplyThinkingFix?: (target: YamlModelRef) => void;
  onBackToReview?: () => void;
  /** a resume created a new job */
  onNewJob?: (job: JobSummary) => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const { job, events, error, source, loading, terminal, refresh } = useJob(jobId);
  const logRef = useRef<HTMLDivElement | null>(null);

  const progress = useMemo(
    () => events.filter((e) => e.type === "progress" || e.type === "cancel_requested" || e.type === "status"),
    [events],
  );

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [progress.length]);

  const cancel = useMutation({
    mutationFn: () => cancelJob(jobId),
    onSuccess: () => {
      toast("info", "Cancel requested — the run stops at its next checkpoint and stays resumable.");
      void refresh();
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const resume = useMutation({
    mutationFn: () => resumeRun(job!.run_id as string, {}),
    onSuccess: (j) => {
      toast("success", `Resumed as job ${j.id}`);
      onNewJob?.(j);
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  if (error && !job) return <InlineError message={error} />;
  if (loading || !job) return <p className="text-sm text-muted">Loading job…</p>;

  const running = !terminal;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <JobStatusBadge status={job.status} />
        <span className="font-mono text-xs text-muted">job {job.id}</span>
        <span className="font-mono text-xs text-muted">
          elapsed <Elapsed from={job.started ?? job.created} to={job.finished} />
        </span>
        <Badge tone="neutral" title="update source">
          {source === "websocket" ? "live · websocket" : "polling · 1.5 s"}
        </Badge>
        {job.run_id && (
          <Link
            href={`/evals/${encodeURIComponent(job.run_id)}`}
            className="rounded-md border border-edge px-2.5 py-1 text-xs text-accent hover:bg-hover"
          >
            Open run {job.run_id} →
          </Link>
        )}
        {running && (
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
            disabled={job.cancel_requested}
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {job.cancel_requested ? "cancel requested, stops at next checkpoint" : "Cancel"}
          </Button>
        )}
      </div>

      {error && <Banner tone="warn" className="py-2 text-xs">{error} — retrying.</Banner>}

      {/* live log */}
      <div
        ref={logRef}
        className={`overflow-auto rounded-lg border border-edge bg-raised/60 p-3 font-mono text-xs leading-relaxed text-fg ${compact ? "max-h-56" : "max-h-96"}`}
      >
        {progress.length === 0 ? (
          <span className="text-faint">{running ? "Waiting for progress…" : "No progress messages."}</span>
        ) : (
          progress.map((e, i) => (
            <div key={i} className="flex gap-3 whitespace-pre-wrap break-words">
              <span className="shrink-0 text-faint">{formatClock(e.ts)}</span>
              <span className={e.type === "status" ? "text-accent" : e.type === "cancel_requested" ? "text-warn" : ""}>
                {e.type === "status"
                  ? `status → ${e.status}`
                  : e.type === "cancel_requested"
                    ? "cancel requested"
                    : (e.message ?? JSON.stringify(e))}
              </span>
            </div>
          ))
        )}
      </div>

      {job.status === "complete" && job.result && (
        <ResultCard result={job.result} />
      )}

      {job.status === "failed" && (
        <Card tone="err" title="Run failed">
          <div className="whitespace-pre-wrap break-words rounded-md border border-err/40 bg-err/5 p-3 font-mono text-xs text-err">
            {job.error ?? "no error detail"}
          </div>
          {mentionsHiddenReasoning(job.error) && yaml && onApplyThinkingFix && (
            <ThinkingFixOffer yaml={yaml} onApply={onApplyThinkingFix} />
          )}
          {onBackToReview && (
            <Button variant="primary" className="mt-3" onClick={onBackToReview}>
              ← Back to review
            </Button>
          )}
        </Card>
      )}

      {job.status === "cancelled" && (
        <Card tone="warn" title="Run cancelled">
          <p className="text-sm text-muted">
            The run stopped at a checkpoint and can be resumed where it left off.
          </p>
          <div className="mt-3 flex gap-2">
            {job.run_id && (
              <Button variant="primary" loading={resume.isPending} onClick={() => resume.mutate()}>
                Resume
              </Button>
            )}
            {onBackToReview && (
              <Button onClick={onBackToReview}>← Back to review</Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/** The hidden-reasoning remedy: pick the model, apply enable_thinking: false. */
export function ThinkingFixOffer({
  yaml,
  onApply,
  defaultTarget,
}: {
  yaml: string;
  onApply: (target: YamlModelRef) => void;
  defaultTarget?: YamlModelRef;
}) {
  const models = useMemo(() => listYamlModels(yaml), [yaml]);
  const [pick, setPick] = useState(() => {
    if (defaultTarget) {
      const i = models.findIndex((m) => m.role === defaultTarget.role && m.name === defaultTarget.name);
      if (i >= 0) return i;
    }
    return 0;
  });
  if (models.length === 0) return null;
  return (
    <Banner tone="accent" title="Thinking model detected" className="mt-3">
      <p className="text-xs">
        Thinking models return empty answers unless told not to think. Apply{" "}
        <code className="font-mono">extra: {"{chat_template_kwargs: {enable_thinking: false}}"}</code>{" "}
        to:
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          className="w-auto"
          value={pick}
          onChange={(e) => setPick(Number(e.target.value))}
        >
          {models.map((m, i) => (
            <option key={i} value={i}>{m.label}</option>
          ))}
        </Select>
        <Button variant="primary" size="sm" onClick={() => onApply(models[pick])}>
          Apply fix to YAML
        </Button>
      </div>
    </Banner>
  );
}

export function ResultCard({ result }: { result: EvalJobResult }) {
  const names = orderCandidates(Object.keys(result.candidates ?? {}));
  return (
    <Card
      tone="ok"
      title="Result"
      actions={<GatesBadge passed={result.gates_passed} />}
    >
      {result.caveats?.length > 0 && (
        <Banner tone="warn" className="mb-3 py-2 text-xs">
          <ul className="list-disc pl-4">
            {result.caveats.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </Banner>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {names.map((n) => {
          const c = result.candidates[n];
          return (
            <div key={n} className={`rounded-md border border-edge p-3 ${isMockName(n) ? "opacity-80" : ""}`}>
              <div className="mb-1 flex items-center justify-between font-mono text-xs">
                <span className="text-fg">{n}{isMockName(n) && <Badge tone="neutral" className="ml-1">mock</Badge>}</span>
                <span className="text-muted">{c.samples} samples · {fmtUsd(c.cost_usd)}</span>
              </div>
              {c.failure_rate > 0 && (
                <p className="mb-1 text-[11px] text-warn">failure rate {fmtPct(c.failure_rate, 1)} · metrics cover only samples that produced output</p>
              )}
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(c.metrics ?? {}).map(([m, v]) => (
                    <tr key={m}>
                      <td className="py-0.5 font-mono text-muted">{m}</td>
                      <td className="py-0.5 text-right font-mono text-fg">mean {fmtNum(v.mean)}</td>
                      <td className="py-0.5 text-right font-mono text-muted">pass {fmtPct(v.pass_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      {result.gates?.length > 0 && (
        <ul className="mt-3 space-y-1">
          {result.gates.map((g, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
              <PassBadge passed={g.passed} />
              <span className="font-mono">{g.gate}</span>
              <span className="font-mono text-muted">= {fmtNum(g.value)}</span>
              <span className="text-muted">{g.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Link
          href={`/evals/${encodeURIComponent(result.run_id)}`}
          className="inline-block rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Open run page →
        </Link>
      </div>
    </Card>
  );
}
