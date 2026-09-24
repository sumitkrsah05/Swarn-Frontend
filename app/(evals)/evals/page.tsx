"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { deleteRun } from "@/api/client";
import type { HeadlineCandidate, RunListItem } from "@/api/types";
import { useInvalidateRuns, useRunsList } from "@/hooks/useEvalData";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/ui";
import { formatTime, timeAgo } from "@/lib/format";
import {
  errorMessage,
  fmtCi,
  fmtNum,
  isJudgeMetric,
  orderCandidates,
  truncate,
} from "@/lib/evals";
import {
  Badge,
  Button,
  CellText,
  ConfirmButton,
  Empty,
  GatesBadge,
  InlineError,
  Loading,
  RunStatusBadge,
  TABLE,
  TD,
  TH,
  TableWrap,
} from "@/components/ui";

/** The one metric shown per candidate on the list: a judge metric if any. */
function headlineMetric(c: HeadlineCandidate | undefined) {
  if (!c) return null;
  const names = Object.keys(c.metrics ?? {});
  if (names.length === 0) return null;
  const name = names.find((n) => isJudgeMetric(n)) ?? names[0];
  return { name, ...c.metrics[name] };
}

function jobIsLive(run: RunListItem) {
  return !!run.job && (run.job.status === "running" || run.job.status === "queued");
}

export default function EvalRunsPage() {
  const toast = useToast();
  const runs = useRunsList(50);
  const invalidate = useInvalidateRuns();

  const del = useMutation({
    mutationFn: (runId: string) => deleteRun(runId),
    onSuccess: (_d, runId) => {
      toast("success", `Deleted run ${runId}`);
      invalidate();
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const items = runs.data?.runs ?? [];

  return (
    <div>
      <PageHeader
        title="Evaluations"
        subtitle={
          <>
            LLM evaluation runs: metrics with confidence intervals, gates and
            per-row judge reasoning.
            {runs.data?.root && (
              <span className="ml-2 font-mono text-xs text-faint">
                root {runs.data.root}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Link
              href="/evals/compare"
              className="rounded-md border border-edge px-3.5 py-1.5 text-sm text-fg hover:bg-hover"
            >
              Compare runs
            </Link>
            <Link
              href="/evals/new"
              className="rounded-md bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent shadow-hair hover:opacity-90"
            >
              New evaluation
            </Link>
          </>
        }
      />

      {runs.isError && <InlineError message={errorMessage(runs.error)} />}
      {runs.isPending && <Loading label="Loading runs…" />}
      {runs.isSuccess && items.length === 0 && (
        <Empty
          title="No evaluation runs yet"
          hint={
            <>
              Start one with <Link href="/evals/new" className="text-accent">New evaluation</Link>.
            </>
          }
        />
      )}

      {items.length > 0 && (
        <TableWrap maxHeight="calc(100vh - 12rem)">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Run</th>
                <th className={TH}>Goal</th>
                <th className={TH}>Status</th>
                <th className={TH}>Candidates · headline metric</th>
                <th className={TH}>Gates</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const live = jobIsLive(r);
                const deleting = del.isPending && del.variables === r.run_id;
                return (
                  <tr key={r.run_id} className="bg-panel hover:bg-hover">
                    <td className={TD}>
                      <Link
                        href={`/evals/${encodeURIComponent(r.run_id)}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {r.run_id}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[11px] text-faint" title={formatTime(r.created)}>
                          {timeAgo(r.created)}
                        </span>
                        {live && (
                          <Badge tone="accent" pulse>
                            {r.job?.status}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className={TD}>
                      <CellText width="16rem" mode="wrap" title={r.goal} className="text-sm text-fg">
                        {truncate(r.goal, 80) || "—"}
                      </CellText>
                    </td>
                    <td className={TD}>
                      <RunStatusBadge status={r.status} />
                    </td>
                    <td className={TD}>
                      <div className="max-w-[20rem] space-y-0.5">
                        {orderCandidates(r.candidates).map((name) => {
                          const m = headlineMetric(r.headline?.[name]);
                          return (
                            <div key={name} className="flex items-baseline gap-2 truncate font-mono text-xs">
                              <span className={/^mock-/.test(name) ? "shrink-0 text-faint" : "shrink-0 text-fg"}>
                                {name}
                              </span>
                              {m ? (
                                <span className="truncate text-muted">
                                  {m.name} {fmtNum(m.mean)}{" "}
                                  <span className="text-faint">
                                    {m.ci95 ? fmtCi(m.ci95[0], m.ci95[1]) : "[—, —]"}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-faint">no metrics</span>
                              )}
                            </div>
                          );
                        })}
                        {r.candidates.length === 0 && (
                          <span className="text-xs text-faint">—</span>
                        )}
                      </div>
                    </td>
                    <td className={TD}>
                      <GatesBadge passed={r.gates_passed} />
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/evals/compare?run=${encodeURIComponent(r.run_id)}`}
                          className="rounded-md px-2 py-1 text-xs text-muted hover:bg-raised hover:text-fg"
                        >
                          compare
                        </Link>
                        <ConfirmButton
                          label="delete"
                          confirmLabel="Delete run"
                          disabled={live || deleting}
                          loading={deleting}
                          title={live ? "A job is still producing this run" : "Delete this run"}
                          onConfirm={() => del.mutate(r.run_id)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {runs.isFetching && !runs.isPending && (
        <p className="mt-2 text-right font-mono text-[11px] text-faint">refreshing…</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => runs.refetch()}
        disabled={runs.isFetching}
      >
        Refresh
      </Button>
    </div>
  );
}
