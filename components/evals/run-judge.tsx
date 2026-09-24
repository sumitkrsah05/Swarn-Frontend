"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { calibrateRun } from "@/api/client";
import type { CalibrateLabel, Calibration, MetricInfo, RunDetail } from "@/api/types";
import { evalKeys, useResults } from "@/hooks/useEvalData";
import { useToast } from "@/components/toast";
import {
  agreementBand,
  configCandidateNames,
  errorMessage,
  fmtNum,
  isJudgeMetric,
  isMockName,
  orderCandidates,
  truncate,
} from "@/lib/evals";
import {
  Badge,
  Banner,
  Button,
  Card,
  CellText,
  Empty,
  Field,
  InlineError,
  KeyValue,
  Loading,
  SectionLabel,
  Select,
  TABLE,
  TD,
  TH,
  TableWrap,
  TextBlock,
  type Tone,
} from "@/components/ui";

const BAND_TONE: Record<string, Tone> = { strong: "ok", moderate: "warn", unreliable: "err" };

function AgreementValue({ label, value }: { label: string; value: number | null | undefined }) {
  const band = agreementBand(value);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-fg">{fmtNum(value)}</span>
      {band && <Badge tone={BAND_TONE[band]}>{band}</Badge>}
    </span>
  );
}

function CalibrationCard({ c }: { c: Calibration }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-6">
        <AgreementValue label="Cohen's κ" value={c.kappa} />
        <AgreementValue label="Spearman ρ" value={c.spearman} />
        <span className="font-mono text-sm text-muted">n = {c.n}</span>
      </div>
      <p className="text-[11px] text-faint">
        Bands: ≥ 0.8 strong · 0.6–0.8 moderate · &lt; 0.6 unreliable
      </p>
    </div>
  );
}

function Diag({ label, value }: { label: string; value: unknown }) {
  if (value == null) return <KeyValue items={[{ k: label, v: <span className="text-faint">—</span> }]} />;
  if (typeof value === "number") return <KeyValue items={[{ k: label, v: <span className="font-mono">{fmtNum(value)}</span> }]} />;
  if (typeof value === "string" || typeof value === "boolean") return <KeyValue items={[{ k: label, v: String(value) }]} />;
  return <TextBlock label={label} text={JSON.stringify(value, null, 2)} maxHeight="12rem" />;
}

export function RunJudge({ run, catalog }: { run: RunDetail; catalog?: MetricInfo[] }) {
  const diag = run.summary?.judge_diagnostics;
  const summaryNames = Object.keys(run.summary?.candidates ?? {});
  const candidates = orderCandidates(
    summaryNames.length ? summaryNames : configCandidateNames(run.config),
  );
  const [candidate, setCandidate] = useState(candidates.find((c) => !isMockName(c)) ?? candidates[0] ?? "");
  const [labels, setLabels] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const qc = useQueryClient();

  const rows = useResults(candidate ? run.run_id : null, { candidate, limit: 50, offset: 0 });
  const judgeMetric = useMemo(() => {
    const names = new Set<string>();
    for (const r of rows.data?.rows ?? []) for (const k of Object.keys(r.scores ?? {})) names.add(k);
    return [...names].find((n) => isJudgeMetric(n, catalog)) ?? null;
  }, [rows.data, catalog]);

  const submit = useMutation({
    mutationFn: () =>
      calibrateRun(run.run_id, {
        labels: Object.entries(labels).map(
          ([sample_id, human_pass]): CalibrateLabel => ({ sample_id, human_pass }),
        ),
      }),
    onSuccess: () => {
      toast("success", "Calibration recorded");
      void qc.invalidateQueries({ queryKey: evalKeys.run(run.run_id) });
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  if (!diag) {
    return <Empty title="No judge diagnostics" hint="This run did not use an LLM judge." />;
  }
  const labelled = Object.keys(labels).length;

  return (
    <div className="space-y-5">
      <Card title="Judge diagnostics">
        <div className="space-y-3">
          <Diag label="verbosity bias corr." value={diag.verbosity_bias_corr} />
          <Diag label="format bias" value={diag.format_bias} />
          <Diag label="pairwise flip rates" value={diag.pairwise_flip_rates} />
          <div>
            <SectionLabel className="mb-1">Calibration</SectionLabel>
            {diag.calibration ? (
              <CalibrationCard c={diag.calibration} />
            ) : (
              <Banner tone="warn" className="py-2 text-xs">
                <Badge tone="warn">unaudited</Badge>{" "}
                Judge scores are opinions until calibrated against human labels. Label rows below.
              </Banner>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Calibrate against human labels"
        subtitle="Mark up to 50 rows of one candidate pass/fail, then submit; the server returns agreement with the judge."
        actions={
          <Button
            variant="primary"
            size="sm"
            disabled={labelled === 0}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit {labelled > 0 ? `${labelled} ` : ""}labels
          </Button>
        }
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-[16rem_auto] sm:items-end">
          <Field label="Candidate">
            <Select
              value={candidate}
              onChange={(e) => {
                setCandidate(e.target.value);
                setLabels({});
                submit.reset();
              }}
            >
              {candidates.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2 pb-1">
            <Button size="sm" onClick={() => setLabels({})} disabled={labelled === 0}>
              Clear labels
            </Button>
          </div>
        </div>

        {submit.data && (
          <Banner tone="ok" title="Calibration result" className="mb-3">
            <CalibrationCard c={submit.data.calibration} />
          </Banner>
        )}

        {rows.isError && <InlineError message={errorMessage(rows.error)} />}
        {rows.isPending && candidate && <Loading label="Loading rows…" />}
        {rows.isSuccess && rows.data.rows.length === 0 && (
          <Empty title="No rows for this candidate" />
        )}
        {rows.isSuccess && rows.data.rows.length > 0 && (
          <TableWrap maxHeight="32rem">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Sample</th>
                  <th className={TH}>Input</th>
                  <th className={TH}>Output</th>
                  <th className={TH}>Reference</th>
                  <th className={TH}>{judgeMetric ?? "judge"}</th>
                  <th className={TH}>Your verdict</th>
                </tr>
              </thead>
              <tbody>
                {rows.data.rows.map((r) => {
                  const mine = labels[r.sample_id];
                  return (
                    <tr key={r.sample_id} className="bg-panel">
                      <td className={`${TD} font-mono text-xs text-accent`}>{r.sample_id}</td>
                      <td className={TD}>
                        <CellText width="18rem" mode="pre" title={r.input} className="text-xs">
                          {truncate(r.input, 160)}
                        </CellText>
                      </td>
                      <td className={TD}>
                        <CellText width="18rem" mode="pre" title={r.output ?? ""} className="text-xs">
                          {truncate(r.output, 160)}
                        </CellText>
                      </td>
                      <td className={TD}>
                        <CellText width="18rem" mode="pre" title={r.reference ?? ""} className="text-xs text-muted">
                          {truncate(r.reference, 160)}
                        </CellText>
                      </td>
                      <td className={`${TD} font-mono text-xs`}>
                        {judgeMetric ? (
                          <span className={r.passed?.[judgeMetric] === false ? "text-err" : r.passed?.[judgeMetric] ? "text-ok" : ""}>
                            {fmtNum(r.scores?.[judgeMetric])}
                          </span>
                        ) : "—"}
                      </td>
                      <td className={TD}>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setLabels((l) => ({ ...l, [r.sample_id]: true }))}
                            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${mine === true ? "border-ok bg-ok/15 text-ok" : "border-edge text-muted hover:text-fg"}`}
                          >
                            pass
                          </button>
                          <button
                            type="button"
                            onClick={() => setLabels((l) => ({ ...l, [r.sample_id]: false }))}
                            className={`rounded border px-2 py-0.5 font-mono text-[11px] ${mine === false ? "border-err bg-err/15 text-err" : "border-edge text-muted hover:text-fg"}`}
                          >
                            fail
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
