"use client";

import type {
  CandidateSummary,
  GateConfig,
  MetricInfo,
  RunDetail,
} from "@/api/types";
import { formatTime } from "@/lib/format";
import {
  FAILURE_RATE_CAVEAT,
  MOCK_BANNER,
  NOT_DECISIVE,
  fmtCi,
  fmtInt,
  fmtLatency,
  fmtNum,
  fmtPct,
  fmtUsd,
  gateInsideCi,
  gateThreshold,
  isJudgeMetric,
  isMockName,
  mockSanityProblems,
  orderCandidates,
  parseGateRef,
} from "@/lib/evals";
import {
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  GatesBadge,
  KeyValue,
  MetricBar,
  PassBadge,
  TABLE,
  TD,
  TH,
  TableWrap,
} from "@/components/ui";

export function RunOverview({
  run,
  catalog,
  onResume,
  onGoToJudge,
  resuming,
}: {
  run: RunDetail;
  catalog?: MetricInfo[];
  onResume: (add?: number) => void;
  onGoToJudge: () => void;
  resuming?: boolean;
}) {
  const s = run.summary;
  if (!s) {
    return (
      <Empty
        title="No summary yet"
        hint="The summary appears once the run has produced results. Incomplete runs can be resumed from the header."
      />
    );
  }
  const names = orderCandidates(Object.keys(s.candidates ?? {}));
  const real = names.filter((n) => !isMockName(n));
  const mocks = names.filter(isMockName);
  const mockProblems = mockSanityProblems(s.candidates, catalog);
  const unaudited = !s.judge_diagnostics?.calibration;
  const configGates = run.config?.gates;

  return (
    <div className="space-y-5">
      {s.caveats?.length > 0 && (
        <Banner tone="warn" title="Caveats">
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {s.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Banner>
      )}

      {mockProblems.length > 0 && (
        <Banner tone="err" title={MOCK_BANNER}>
          <ul className="list-disc pl-5 font-mono text-xs">
            {mockProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Banner>
      )}

      {s.stage2_recommendation && (
        <Banner tone="accent" title="Recommendation: run more rows">
          <p className="text-sm">{s.stage2_recommendation.reason}</p>
          <Button
            variant="primary"
            size="sm"
            className="mt-2"
            loading={resuming}
            onClick={() => onResume(s.stage2_recommendation?.additional_rows)}
          >
            Resume with {fmtInt(s.stage2_recommendation.additional_rows)} more rows
          </Button>
        </Banner>
      )}

      <Card title="Run">
        <p className="mb-3 whitespace-pre-wrap text-sm text-fg">{s.goal || "—"}</p>
        <KeyValue
          items={[
            { k: "run id", v: <span className="font-mono text-xs">{s.run_id}</span> },
            {
              k: "generated",
              v: (
                <span className="font-mono text-xs">
                  {typeof s.generated_at === "number"
                    ? formatTime(s.generated_at)
                    : s.generated_at}
                </span>
              ),
            },
            { k: "config hash", v: <span className="font-mono text-xs">{s.config_hash}</span> },
            { k: "dataset hash", v: <span className="font-mono text-xs">{s.dataset_hash}</span> },
            { k: "seed", v: <span className="font-mono text-xs">{s.seed ?? "—"}</span> },
            {
              k: "sampled",
              v: (
                <span className="font-mono text-xs">
                  {s.sampled ? "yes" : "no"} · {fmtInt(s.dataset_rows_used)} rows used
                </span>
              ),
            },
          ]}
        />
      </Card>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Candidates</h3>
        {real.length === 0 && <p className="text-sm text-muted">No real candidates.</p>}
        <div className={`grid gap-4 ${real.length > 1 ? "xl:grid-cols-2" : ""}`}>
          {real.map((n) => (
            <CandidateCard
              key={n}
              name={n}
              c={s.candidates[n]}
              catalog={catalog}
              unaudited={unaudited}
              onGoToJudge={onGoToJudge}
              configGates={configGates}
            />
          ))}
        </div>
        {mocks.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-sm font-semibold text-muted">
              Mock baselines{" "}
              <span className="font-normal text-faint">
                (self-test: they prove the scoring works)
              </span>
            </h3>
            <div className={`grid gap-4 ${mocks.length > 1 ? "xl:grid-cols-2" : ""}`}>
              {mocks.map((n) => (
                <CandidateCard
                  key={n}
                  name={n}
                  c={s.candidates[n]}
                  catalog={catalog}
                  unaudited={unaudited}
                  onGoToJudge={onGoToJudge}
                  configGates={configGates}
                  mock
                />
              ))}
            </div>
          </>
        )}
      </section>

      <Card
        title="Gates"
        actions={<GatesBadge passed={s.gates_passed} />}
      >
        {!s.gates?.length ? (
          <p className="text-sm text-muted">No gates configured.</p>
        ) : (
          <TableWrap maxHeight="20rem">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th className={TH}>Result</th>
                  <th className={TH}>Gate</th>
                  <th className={TH}>Value</th>
                  <th className={TH}>Threshold</th>
                  <th className={TH}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {s.gates.map((g, i) => {
                  const inside = gateInsideCi(g, configGates, s.candidates);
                  const threshold = gateThreshold(g, configGates);
                  return (
                    <tr key={i} className="bg-panel">
                      <td className={TD}><PassBadge passed={g.passed} /></td>
                      <td className={`${TD} font-mono text-xs`}>{g.gate}</td>
                      <td className={`${TD} font-mono text-xs`}>{fmtNum(g.value)}</td>
                      <td className={`${TD} font-mono text-xs`}>
                        {threshold != null ? fmtNum(threshold) : "—"}
                      </td>
                      <td className={`${TD} whitespace-normal text-xs text-muted`}>
                        {g.reason}
                        {inside && (
                          <Badge tone="warn" className="ml-2">
                            {NOT_DECISIVE}
                          </Badge>
                        )}
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

function CandidateCard({
  name,
  c,
  catalog,
  unaudited,
  onGoToJudge,
  configGates,
  mock,
}: {
  name: string;
  c: CandidateSummary;
  catalog?: MetricInfo[];
  unaudited: boolean;
  onGoToJudge: () => void;
  configGates?: GateConfig[];
  mock?: boolean;
}) {
  const metrics = Object.entries(c.metrics ?? {});
  // gate thresholds for this candidate, keyed by metric, to draw on the bar
  const thresholds: Record<string, number> = {};
  for (const g of configGates ?? []) {
    const ref = parseGateRef(g.metric);
    if (ref && ref.candidate === name && ref.stat === "mean") {
      thresholds[ref.metric] = g.threshold;
    }
  }
  return (
    <Card
      className={mock ? "opacity-90" : ""}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{name}</span>
          {mock && <Badge tone="neutral">mock</Badge>}
        </span>
      }
      actions={
        <span className="font-mono text-xs text-muted">
          pass rate {fmtPct(c.pass_rate)}
        </span>
      }
    >
      {c.failure_rate > 0 && (
        <Banner tone="warn" className="mb-3 py-2 text-xs">
          failure rate {fmtPct(c.failure_rate, 1)} · {FAILURE_RATE_CAVEAT}
        </Banner>
      )}
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-3">
        <Stat k="samples" v={fmtInt(c.samples)} />
        <Stat k="failures" v={`${fmtInt(c.failures)} (${fmtPct(c.failure_rate, 1)})`} />
        <Stat k="cost" v={fmtUsd(c.cost_usd)} />
        <Stat k="cache hits" v={fmtInt(c.cache_hits)} />
        <Stat k="avg latency" v={fmtLatency(c.latency_s_avg)} />
        <Stat k="tokens in/out" v={`${fmtInt(c.tokens_in)} / ${fmtInt(c.tokens_out)}`} />
      </div>
      {metrics.length === 0 ? (
        <p className="text-xs text-muted">No metrics.</p>
      ) : (
        <TableWrap maxHeight="18rem">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Metric</th>
                <th className={TH}>Mean</th>
                <th className={TH}>95% CI</th>
                <th className={TH}></th>
                <th className={TH}>Pass</th>
                <th className={TH}>n</th>
                <th className={TH}>Err</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(([m, v]) => {
                const judge = isJudgeMetric(m, catalog);
                return (
                  <tr key={m} className="bg-panel">
                    <td className={`${TD} font-mono text-xs`}>
                      {m}
                      {judge && unaudited && (
                        <button
                          type="button"
                          onClick={onGoToJudge}
                          className="ml-2 rounded border border-warn/40 px-1 text-[10px] text-warn hover:bg-warn/10"
                          title="Judge scores are opinions until calibrated — open the Judge tab"
                        >
                          unaudited
                        </button>
                      )}
                    </td>
                    <td className={`${TD} font-mono text-xs text-fg`}>{fmtNum(v.mean)}</td>
                    <td className={`${TD} font-mono text-xs text-muted`}>
                      {fmtCi(v.ci95_low, v.ci95_high)}
                    </td>
                    <td className={TD}>
                      <MetricBar
                        mean={v.mean}
                        lo={v.ci95_low}
                        hi={v.ci95_high}
                        threshold={thresholds[m]}
                      />
                    </td>
                    <td className={`${TD} font-mono text-xs`}>{fmtPct(v.pass_rate)}</td>
                    <td className={`${TD} font-mono text-xs`}>{fmtInt(v.n)}</td>
                    <td className={`${TD} font-mono text-xs ${v.errors > 0 ? "text-err" : ""}`}>
                      {fmtInt(v.errors)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <span className="text-faint">{k} </span>
      <span className="text-fg">{v}</span>
    </div>
  );
}
