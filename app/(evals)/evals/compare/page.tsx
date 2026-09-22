"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { compareRuns } from "@/api/client";
import type { ComparePair, RunListItem } from "@/api/types";
import { useRunsList } from "@/hooks/useEvalData";
import { PageHeader } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { timeAgo } from "@/lib/format";
import { errorMessage, fmtCi, fmtNum, truncate } from "@/lib/evals";
import {
  Badge,
  Banner,
  Button,
  Card,
  Collapsible,
  CopyButton,
  Empty,
  Field,
  InlineError,
  Input,
  Loading,
  TABLE,
  TD,
  TH,
  TableWrap,
} from "@/components/evals/primitives";
import { verdictTone } from "@/components/evals/run-comparisons";

export default function ComparePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Compare />
    </Suspense>
  );
}

/** Searchable run selector backed by the runs list. */
function RunSelect({
  label,
  value,
  onChange,
  runs,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  runs: RunListItem[];
  id: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter(
      (r) => r.run_id.toLowerCase().includes(needle) || (r.goal ?? "").toLowerCase().includes(needle),
    );
  }, [q, runs]);
  return (
    <Field label={label} htmlFor={id}>
      <Input
        placeholder="search id or goal…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-1"
      />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        size={6}
        className="w-full rounded-md border border-edge bg-panel font-mono text-xs text-fg focus:border-accent focus:outline-none"
      >
        {value && !filtered.some((r) => r.run_id === value) && (
          <option value={value}>{value}</option>
        )}
        {filtered.map((r) => (
          <option key={r.run_id} value={r.run_id} className="px-2 py-1">
            {r.run_id} · {r.status} · {timeAgo(r.created)} · {truncate(r.goal, 50)}
          </option>
        ))}
      </select>
      <Input
        placeholder="or type a run id / unique prefix"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 font-mono text-xs"
      />
    </Field>
  );
}

function Compare() {
  const search = useSearchParams();
  const runs = useRunsList(50);
  const [run, setRun] = useState(search.get("run") ?? "");
  const [baseline, setBaseline] = useState(search.get("baseline") ?? "");
  const [maxDrop, setMaxDrop] = useState("");
  const [pValue, setPValue] = useState("");

  const compare = useMutation({
    mutationFn: () =>
      compareRuns({
        run,
        baseline,
        max_drop: maxDrop.trim() ? Number(maxDrop) : undefined,
        p_value: pValue.trim() ? Number(pValue) : undefined,
      }),
  });

  const list = runs.data?.runs ?? [];
  const result = compare.data;
  const regressionKeys = useMemo(
    () => new Set((result?.regressions ?? []).map((p) => `${p.candidate}/${p.metric}`)),
    [result],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compare runs"
        subtitle="Candidate run against a baseline run, per candidate and metric, with regression detection."
        actions={<Link href="/evals" className="text-sm text-muted hover:text-fg">← Runs</Link>}
      />

      {runs.isError && <InlineError message={errorMessage(runs.error)} />}

      <Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <RunSelect id="cmp-run" label="Run (candidate)" value={run} onChange={setRun} runs={list} />
          <RunSelect id="cmp-base" label="Baseline" value={baseline} onChange={setBaseline} runs={list} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_10rem_auto] sm:items-end">
          <Field label="Max drop (optional)" hint="largest tolerated decrease">
            <Input type="number" step="0.01" value={maxDrop} onChange={(e) => setMaxDrop(e.target.value)} placeholder="e.g. 0.05" />
          </Field>
          <Field label="p-value (optional)" hint="significance threshold">
            <Input type="number" step="0.01" min="0" max="1" value={pValue} onChange={(e) => setPValue(e.target.value)} placeholder="e.g. 0.05" />
          </Field>
          <Button
            variant="primary"
            disabled={!run.trim() || !baseline.trim()}
            loading={compare.isPending}
            onClick={() => compare.mutate()}
          >
            Compare
          </Button>
        </div>
        {runs.isSuccess && list.length === 0 && (
          <p className="mt-3 text-xs text-muted">No runs yet — ids can still be typed by hand.</p>
        )}
      </Card>

      {compare.isError && <InlineError message={errorMessage(compare.error)} />}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={result.passed ? "ok" : "err"} className="px-3 py-1 text-sm">
              {result.passed ? "PASSED" : "FAILED"}
            </Badge>
            <span className="font-mono text-xs text-muted">
              {result.candidate_run} <span className="text-faint">vs baseline</span> {result.baseline_run}
            </span>
            <span className="font-mono text-xs text-muted">
              {result.regressions.length} regression{result.regressions.length === 1 ? "" : "s"}
            </span>
          </div>

          {result.warnings.length > 0 && (
            <Banner tone="warn" title="Warnings">
              <ul className="list-disc pl-5 text-sm">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Banner>
          )}

          {result.pairs.length === 0 ? (
            <Empty title="No comparable pairs" hint="The runs share no candidate/metric combinations." />
          ) : (
            <TableWrap maxHeight="32rem">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th className={TH}>Candidate</th>
                    <th className={TH}>Metric</th>
                    <th className={TH}>Delta</th>
                    <th className={TH}>95% CI</th>
                    <th className={TH}>Test</th>
                    <th className={TH}>p</th>
                    <th className={TH}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pairs.map((p: ComparePair, i) => {
                    const regressed = regressionKeys.has(`${p.candidate}/${p.metric}`);
                    return (
                      <tr key={i} className={regressed ? "bg-err/10" : "bg-panel"}>
                        <td className={`${TD} font-mono text-xs`}>{p.candidate}</td>
                        <td className={`${TD} font-mono text-xs`}>{p.metric}</td>
                        <td className={`${TD} font-mono text-xs ${p.delta != null && p.delta < 0 ? "text-err" : p.delta != null && p.delta > 0 ? "text-ok" : ""}`}>
                          {p.delta != null && p.delta > 0 ? "+" : ""}{fmtNum(p.delta)}
                        </td>
                        <td className={`${TD} font-mono text-xs text-muted`}>{p.ci ? fmtCi(p.ci[0], p.ci[1]) : "—"}</td>
                        <td className={`${TD} font-mono text-xs text-muted`}>{p.test ?? "—"}</td>
                        <td className={`${TD} font-mono text-xs`}>{p.p == null ? "—" : p.p < 0.001 ? "<0.001" : p.p.toFixed(3)}</td>
                        <td className={TD}>
                          <Badge tone={regressed ? "err" : verdictTone(p.verdict)}>
                            {regressed ? `regression · ${p.verdict}` : p.verdict || "—"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}

          <Collapsible
            summary={
              <span className="inline-flex items-center gap-2">
                Markdown summary <CopyButton text={result.markdown} />
              </span>
            }
          >
            <div className="max-h-[32rem] overflow-auto rounded-md border border-edge bg-raised/50 p-4">
              <Markdown>{result.markdown}</Markdown>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">raw markdown</summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-raised/60 p-3 font-mono text-xs">{result.markdown}</pre>
            </details>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
