"use client";

import { useEffect, useMemo, useState } from "react";
import type { MetricInfo, ResultRow, RunDetail } from "@/api/types";
import { useResults } from "@/hooks/useEvalData";
import {
  configCandidateNames,
  errorMessage,
  fmtLatency,
  fmtNum,
  fmtUsd,
  isJudgeMetric,
  isMockName,
  orderCandidates,
} from "@/lib/evals";
import {
  Badge,
  Button,
  CellText,
  Checkbox,
  Drawer,
  Empty,
  Field,
  InlineError,
  Input,
  Loading,
  SectionLabel,
  Select,
  TABLE,
  TD,
  TH,
  TableWrap,
  TextBlock,
} from "@/components/ui";

const PAGE = 50;

function scoreClass(passed: boolean | undefined) {
  if (passed === true) return "text-ok";
  if (passed === false) return "text-err";
  return "text-fg";
}

export function RunResults({
  run,
  catalog,
}: {
  run: RunDetail;
  catalog?: MetricInfo[];
}) {
  const summaryNames = Object.keys(run.summary?.candidates ?? {});
  const candidates = orderCandidates(
    summaryNames.length ? summaryNames : configCandidateNames(run.config),
  );
  const metricNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of Object.values(run.summary?.candidates ?? {})) {
      for (const m of Object.keys(c.metrics ?? {})) set.add(m);
    }
    for (const m of run.config?.metrics ?? []) set.add(m.name);
    return [...set];
  }, [run]);

  const [candidate, setCandidate] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [sampleInput, setSampleInput] = useState("");
  const [sampleId, setSampleId] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ResultRow | null>(null);

  // debounce the sample-id filter
  useEffect(() => {
    const t = setTimeout(() => setSampleId(sampleInput.trim()), 400);
    return () => clearTimeout(t);
  }, [sampleInput]);

  const query = { candidate, only_failed: onlyFailed, sample_id: sampleId, offset, limit: PAGE };
  const results = useResults(run.run_id, query);
  const rows = useMemo(() => results.data?.rows ?? [], [results.data]);
  const total = results.data?.total ?? 0;

  // columns: the union of metric names seen on the page plus the known ones
  const columns = useMemo(() => {
    const set = new Set(metricNames);
    for (const r of rows) for (const k of Object.keys(r.scores ?? {})) set.add(k);
    return [...set];
  }, [metricNames, rows]);

  const resetPage = () => setOffset(0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
        <Field label="Candidate">
          <Select
            value={candidate}
            onChange={(e) => {
              setCandidate(e.target.value);
              resetPage();
            }}
          >
            <option value="">all candidates</option>
            {candidates.map((c) => (
              <option key={c} value={c}>
                {isMockName(c) ? `${c} (mock)` : c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sample id">
          <Input
            value={sampleInput}
            placeholder="filter by sample id"
            onChange={(e) => {
              setSampleInput(e.target.value);
              resetPage();
            }}
          />
        </Field>
        <div className="pb-1.5">
          <Checkbox
            label="Only failed"
            checked={onlyFailed}
            onChange={(v) => {
              setOnlyFailed(v);
              resetPage();
            }}
          />
        </div>
      </div>

      {results.isError && <InlineError message={errorMessage(results.error)} />}
      {results.isPending && <Loading label="Loading results…" />}
      {results.isSuccess && rows.length === 0 && (
        <Empty
          title="No rows match"
          hint={total === 0 && !candidate && !onlyFailed && !sampleId ? "This run has no per-row results yet." : "Try clearing a filter."}
        />
      )}

      {rows.length > 0 && (
        <TableWrap maxHeight="calc(100vh - 22rem)">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Sample</th>
                <th className={TH}>Candidate</th>
                {columns.map((m) => (
                  <th key={m} className={TH}>
                    {m}
                  </th>
                ))}
                <th className={TH}>Latency</th>
                <th className={TH}>Cached</th>
                <th className={TH}>Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.candidate}:${r.sample_id}`}
                  onClick={() => setSelected(r)}
                  className={`cursor-pointer bg-panel hover:bg-hover ${isMockName(r.candidate) ? "text-muted" : ""}`}
                >
                  <td className={`${TD} font-mono text-xs text-accent`}>{r.sample_id}</td>
                  <td className={`${TD} font-mono text-xs`}>
                    {r.candidate}
                    {isMockName(r.candidate) && (
                      <Badge tone="neutral" className="ml-1">mock</Badge>
                    )}
                  </td>
                  {columns.map((m) => {
                    const v = r.scores?.[m];
                    const err = r.metric_errors?.[m];
                    return (
                      <td
                        key={m}
                        className={`${TD} font-mono text-xs ${scoreClass(r.passed?.[m])}`}
                        title={err ?? undefined}
                      >
                        {err ? <span className="text-err">err</span> : v == null ? "—" : fmtNum(v)}
                      </td>
                    );
                  })}
                  <td className={`${TD} font-mono text-xs text-muted`}>{fmtLatency(r.latency_s)}</td>
                  <td className={`${TD} font-mono text-xs text-muted`}>{r.cached ? "yes" : "no"}</td>
                  <td className={TD}>
                    <CellText width="16rem" title={r.error ?? undefined} className="text-xs text-err">
                      {r.error ?? ""}
                    </CellText>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="font-mono">
            {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            {results.isFetching && " · loading…"}
          </span>
          <div className="flex gap-1">
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              ← Prev
            </Button>
            <Button size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
              Next →
            </Button>
          </div>
        </div>
      )}

      <ResultDrawer row={selected} onClose={() => setSelected(null)} catalog={catalog} />
    </div>
  );
}

export function ResultDrawer({
  row,
  onClose,
  catalog,
}: {
  row: ResultRow | null;
  onClose: () => void;
  catalog?: MetricInfo[];
}) {
  const judge = row?.metric_details?.judge_rubric;
  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={
        row ? (
          <span className="font-mono">
            {row.sample_id} <span className="text-muted">·</span> {row.candidate}
          </span>
        ) : null
      }
    >
      {row && (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <TextBlock label="Input" text={row.input} maxHeight="22rem" />
            <TextBlock label="Output" text={row.output} maxHeight="22rem" />
            <TextBlock label="Reference" text={row.reference} maxHeight="22rem" />
          </div>

          {row.error && (
            <InlineError message={row.error} />
          )}

          <section>
            <SectionLabel as="h3" className="mb-1">Scores</SectionLabel>
            <TableWrap maxHeight="14rem">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th className={TH}>Metric</th>
                    <th className={TH}>Score</th>
                    <th className={TH}>Pass</th>
                    <th className={TH}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(
                    new Set([
                      ...Object.keys(row.scores ?? {}),
                      ...Object.keys(row.passed ?? {}),
                      ...Object.keys(row.metric_errors ?? {}),
                    ]),
                  ).map((m) => (
                    <tr key={m} className="bg-panel">
                      <td className={`${TD} font-mono text-xs`}>
                        {m}
                        {isJudgeMetric(m, catalog) && (
                          <Badge tone="violet" className="ml-1">judge</Badge>
                        )}
                      </td>
                      <td className={`${TD} font-mono text-xs ${scoreClass(row.passed?.[m])}`}>
                        {fmtNum(row.scores?.[m])}
                      </td>
                      <td className={`${TD} font-mono text-xs`}>
                        {row.passed?.[m] == null ? "—" : row.passed[m] ? "pass" : "fail"}
                      </td>
                      <td className={`${TD} whitespace-normal text-xs text-err`}>
                        {row.metric_errors?.[m] ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </section>

          {judge && (
            <section className="space-y-3">
              <SectionLabel as="h3">Judge criteria</SectionLabel>
              {judge.criteria && Object.keys(judge.criteria).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(judge.criteria).map(([name, c]) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-edge bg-raised px-2 py-1 font-mono text-xs"
                    >
                      <span className="text-muted">{name}</span>
                      <span className="text-fg">{String(c.verdict)}</span>
                    </span>
                  ))}
                </div>
              )}
              <TextBlock label="Judge reasoning" text={judge.reasoning} maxHeight="24rem" />
            </section>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted sm:grid-cols-4">
            <span>latency {fmtLatency(row.latency_s)}</span>
            <span>tokens {row.tokens_in ?? "—"} / {row.tokens_out ?? "—"}</span>
            <span>cost {fmtUsd(row.cost_usd)}</span>
            <span>cached {row.cached ? "yes" : "no"}</span>
          </div>

          {row.metadata && Object.keys(row.metadata).length > 0 && (
            <TextBlock
              label="Metadata"
              text={JSON.stringify(row.metadata, null, 2)}
              maxHeight="12rem"
            />
          )}
        </div>
      )}
    </Drawer>
  );
}
