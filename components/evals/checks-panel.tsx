"use client";

/**
 * Wizard step 2, right-hand side: Validate / Ping / Estimate cards, the run
 * options, and the Run button whose enabled state is a small state machine:
 *
 *   run enabled  ⇔  last validate returned ok:true for the CURRENT yaml
 *   ping failure ⇒  still enabled, but warns the run will abort at pre-flight
 *   cost label   =  last estimate's total, or "not estimated"
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateConfig, pingConfig, validateConfig } from "@/api/client";
import type {
  ConfigBody,
  EstimateResponse,
  PingResponse,
  RunOptions,
  ValidateResponse,
} from "@/api/types";
import {
  errorMessage,
  fmtInt,
  fmtLatency,
  fmtNum,
  fmtUsd,
  mentionsHiddenReasoning,
  selfJudgeConflicts,
  type YamlModelRef,
} from "@/lib/evals";
import { ThinkingFixOffer } from "./job-monitor";
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Collapsible,
  Field,
  Input,
  KeyValue,
  TABLE,
  TD,
  TH,
  TableWrap,
} from "./primitives";

export interface ChecksApi {
  validate: (body: ConfigBody) => Promise<ValidateResponse>;
  ping: (body: ConfigBody) => Promise<PingResponse>;
  estimate: (body: ConfigBody, full?: boolean) => Promise<EstimateResponse>;
}

export const defaultChecksApi: ChecksApi = {
  validate: validateConfig,
  ping: pingConfig,
  estimate: estimateConfig,
};

interface CheckState<T> {
  status: "idle" | "loading" | "done" | "error";
  data?: T;
  error?: string;
  /** yaml the result was computed for (staleness) */
  yaml?: string;
}

const IDLE: CheckState<never> = { status: "idle" };

export function ChecksPanel({
  yaml,
  runOptions,
  onRunOptionsChange,
  onRun,
  running,
  onApplyThinkingFix,
  api = defaultChecksApi,
  debounceMs = 800,
}: {
  yaml: string;
  runOptions: RunOptions;
  onRunOptionsChange: (o: RunOptions) => void;
  onRun: () => void;
  running?: boolean;
  onApplyThinkingFix?: (target: YamlModelRef) => void;
  api?: ChecksApi;
  debounceMs?: number;
}) {
  const [validate, setValidate] = useState<CheckState<ValidateResponse>>(IDLE);
  const [ping, setPing] = useState<CheckState<PingResponse>>(IDLE);
  const [estimate, setEstimate] = useState<CheckState<EstimateResponse>>(IDLE);
  const seq = useRef({ validate: 0, ping: 0, estimate: 0 });

  const runValidate = useCallback(
    async (text: string) => {
      const n = ++seq.current.validate;
      setValidate({ status: "loading", yaml: text });
      try {
        const data = await api.validate({ yaml: text });
        if (n !== seq.current.validate) return;
        setValidate({ status: "done", data, yaml: text });
      } catch (e) {
        if (n !== seq.current.validate) return;
        setValidate({ status: "error", error: errorMessage(e), yaml: text });
      }
    },
    [api],
  );

  const runPing = useCallback(async () => {
    const n = ++seq.current.ping;
    const text = yaml;
    setPing({ status: "loading", yaml: text });
    try {
      const data = await api.ping({ yaml: text });
      if (n !== seq.current.ping) return;
      setPing({ status: "done", data, yaml: text });
    } catch (e) {
      if (n !== seq.current.ping) return;
      setPing({ status: "error", error: errorMessage(e), yaml: text });
    }
  }, [api, yaml]);

  const runEstimate = useCallback(async () => {
    const n = ++seq.current.estimate;
    const text = yaml;
    setEstimate({ status: "loading", yaml: text });
    try {
      const data = await api.estimate({ yaml: text }, !!runOptions.full);
      if (n !== seq.current.estimate) return;
      setEstimate({ status: "done", data, yaml: text });
    } catch (e) {
      if (n !== seq.current.estimate) return;
      setEstimate({ status: "error", error: errorMessage(e), yaml: text });
    }
  }, [api, yaml, runOptions.full]);

  // debounced validate on edit
  useEffect(() => {
    if (!yaml.trim()) return;
    const t = setTimeout(() => void runValidate(yaml), debounceMs);
    return () => clearTimeout(t);
  }, [yaml, debounceMs, runValidate]);

  const validateOk = validate.status === "done" && validate.data?.ok === true;
  const validateFresh = validate.yaml === yaml;
  const runEnabled = validateOk && validateFresh && !running;
  const pingFailed = !!ping.data?.checks.some((c) => c.ok === false);
  const conflicts = selfJudgeConflicts(validate.data?.plan);
  const estimateStale = estimate.status === "done" && estimate.yaml !== yaml;
  const costLabel =
    estimate.status === "done" && estimate.data
      ? `est. ${fmtUsd(estimate.data.total_cost_usd)}${estimateStale ? " · stale" : ""}`
      : "not estimated";

  const setOpt = (patch: Partial<RunOptions>) => onRunOptionsChange({ ...runOptions, ...patch });

  return (
    <div className="space-y-3">
      {/* ---------------------------------------------------- validate */}
      <Card
        title="Validate"
        subtitle="runs automatically 800 ms after an edit"
        actions={
          <>
            {validate.status === "done" && (
              <Badge tone={validate.data?.ok ? "ok" : "err"}>
                {validate.data?.ok ? "ok" : `${validate.data?.errors.length ?? 0} error(s)`}
                {!validateFresh && " · stale"}
              </Badge>
            )}
            <Button size="sm" loading={validate.status === "loading"} onClick={() => runValidate(yaml)} data-testid="validate-button">
              Validate
            </Button>
          </>
        }
      >
        {validate.status === "idle" && <p className="text-xs text-muted">Not validated yet.</p>}
        {validate.status === "error" && <Banner tone="err">{validate.error}</Banner>}
        {validate.data && (
          <div className="space-y-3">
            {validate.data.errors.length > 0 && (
              <ul className="list-disc space-y-0.5 rounded-md border border-err/40 bg-err/5 py-2 pr-3 pl-7 text-xs text-err" data-testid="validate-errors">
                {validate.data.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {validate.data.warnings.length > 0 && (
              <ul className="list-disc space-y-0.5 rounded-md border border-warn/40 bg-warn/5 py-2 pr-3 pl-7 text-xs text-warn">
                {validate.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            {validate.data.plan && <PlanSummary plan={validate.data.plan} />}
            {validate.data.dataset && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Dataset profile</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs sm:grid-cols-4">
                  <Stat k="rows" v={fmtInt(validate.data.dataset.total_rows)} />
                  <Stat k="valid" v={fmtInt(validate.data.dataset.valid_rows)} />
                  <Stat k="malformed" v={fmtInt(validate.data.dataset.malformed)} warn={validate.data.dataset.malformed > 0} />
                  <Stat k="oversized" v={fmtInt(validate.data.dataset.oversized)} warn={validate.data.dataset.oversized > 0} />
                  <Stat k="exact dups" v={fmtInt(validate.data.dataset.exact_duplicates)} warn={validate.data.dataset.exact_duplicates > 0} />
                  <Stat k="near dups" v={fmtInt(validate.data.dataset.near_duplicates)} warn={validate.data.dataset.near_duplicates > 0} />
                  <Stat k="avg in tokens" v={fmtNum(validate.data.dataset.avg_input_tokens, 0)} />
                  <Stat k="avg ref tokens" v={fmtNum(validate.data.dataset.avg_reference_tokens, 0)} />
                </div>
              </div>
            )}
            {validate.data.lines.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted">server notes ({validate.data.lines.length})</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-raised/60 p-2 font-mono text-[11px]">{validate.data.lines.join("\n")}</pre>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------------- ping */}
      <Card
        title="Ping"
        subtitle="one request per model to prove the endpoints answer"
        actions={
          <>
            {ping.status === "done" && (
              <Badge tone={pingFailed ? "err" : "ok"}>{pingFailed ? "failure" : "ok"}</Badge>
            )}
            <Button size="sm" loading={ping.status === "loading"} onClick={runPing} data-testid="ping-button">
              Ping
            </Button>
          </>
        }
      >
        {ping.status === "idle" && <p className="text-xs text-muted">Not pinged yet.</p>}
        {ping.status === "error" && <Banner tone="err">{ping.error}</Banner>}
        {ping.data && (
          <>
            <TableWrap maxHeight="14rem">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th className={TH}>Role</th>
                    <th className={TH}>Name</th>
                    <th className={TH}>Model @ base_url</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Latency</th>
                    <th className={TH}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {ping.data.checks.map((c, i) => (
                    <tr key={i} className="bg-panel">
                      <td className={`${TD} text-xs text-muted`}>{c.role}</td>
                      <td className={`${TD} font-mono text-xs`}>{c.name}</td>
                      <td className={`${TD} font-mono text-xs text-muted`}>
                        {c.model ?? "—"}{c.base_url ? ` @ ${c.base_url}` : ""}
                      </td>
                      <td className={TD}>
                        <Badge tone={c.ok === true ? "ok" : c.ok === false ? "err" : "neutral"}>
                          {c.ok === true ? "ok" : c.ok === false ? "failed" : "skipped"}
                        </Badge>
                      </td>
                      <td className={`${TD} font-mono text-xs`}>{fmtLatency(c.latency_s)}</td>
                      <td className={`${TD} max-w-[20rem] whitespace-normal text-xs text-err`}>{c.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {onApplyThinkingFix &&
              ping.data.checks
                .filter((c) => mentionsHiddenReasoning(c.error))
                .map((c, i) => (
                  <ThinkingFixOffer
                    key={i}
                    yaml={yaml}
                    onApply={onApplyThinkingFix}
                    defaultTarget={{
                      role: c.role === "candidate" ? "candidate" : "judge",
                      name: c.role === "candidate" ? c.name : undefined,
                      label: c.name,
                    }}
                  />
                ))}
          </>
        )}
      </Card>

      {/* ---------------------------------------------------- estimate */}
      <Card
        title="Estimate"
        subtitle="requests, tokens, cost and time before anything is spent"
        actions={
          <>
            {estimate.status === "done" && estimate.data && (
              <Badge tone={estimate.data.exceeds_budget ? "err" : "ok"}>
                {fmtUsd(estimate.data.total_cost_usd)}{estimateStale ? " · stale" : ""}
              </Badge>
            )}
            <Button size="sm" loading={estimate.status === "loading"} onClick={runEstimate} data-testid="estimate-button">
              Estimate
            </Button>
          </>
        }
      >
        {estimate.status === "idle" && <p className="text-xs text-muted">Not estimated yet.</p>}
        {estimate.status === "error" && <Banner tone="err">{estimate.error}</Banner>}
        {estimate.data && (
          <div className="space-y-2">
            {estimate.data.exceeds_budget && (
              <Banner tone="err" className="py-2 text-xs">
                Estimated cost {fmtUsd(estimate.data.total_cost_usd)} exceeds the configured budget
                {estimate.data.budget_usd != null && <> of {fmtUsd(estimate.data.budget_usd)}</>}.
              </Banner>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-xs sm:grid-cols-4">
              <Stat k="rows" v={`${fmtInt(estimate.data.rows)}${estimate.data.sampled ? " (sampled)" : ""}`} />
              <Stat k="requests" v={fmtInt(estimate.data.total_requests)} />
              <Stat k="cost" v={fmtUsd(estimate.data.total_cost_usd)} warn={estimate.data.exceeds_budget} />
              <Stat k="est. time" v={`${fmtNum(estimate.data.est_minutes, 1)} min`} />
              <Stat k="budget" v={estimate.data.budget_usd == null ? "—" : fmtUsd(estimate.data.budget_usd)} />
            </div>
            <TableWrap maxHeight="12rem">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th className={TH}>Model</th>
                    <th className={TH}>Requests</th>
                    <th className={TH}>Tokens in</th>
                    <th className={TH}>Tokens out</th>
                    <th className={TH}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {[...estimate.data.models, ...(estimate.data.judge ? [{ ...estimate.data.judge, name: `judge · ${estimate.data.judge.name}` }] : [])].map((m, i) => (
                    <tr key={i} className="bg-panel">
                      <td className={`${TD} font-mono text-xs`}>{m.name}</td>
                      <td className={`${TD} font-mono text-xs`}>{fmtInt(m.requests)}</td>
                      <td className={`${TD} font-mono text-xs`}>{fmtInt(m.tokens_in)}</td>
                      <td className={`${TD} font-mono text-xs`}>{fmtInt(m.tokens_out)}</td>
                      <td className={`${TD} font-mono text-xs`}>{fmtUsd(m.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {estimate.data.lines.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-muted">server notes ({estimate.data.lines.length})</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-raised/60 p-2 font-mono text-[11px]">{estimate.data.lines.join("\n")}</pre>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* ---------------------------------------------------- options */}
      <Collapsible summary="Run options">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Label" hint="free text shown on the job">
            <Input value={runOptions.label ?? ""} onChange={(e) => setOpt({ label: e.target.value || undefined })} />
          </Field>
          <Field label="Max cost (USD)" hint="abort when the running cost passes this">
            <Input
              type="number"
              step="0.5"
              min="0"
              value={runOptions.max_cost_usd ?? ""}
              onChange={(e) => setOpt({ max_cost_usd: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          <Checkbox label="No cache" hint="re-query models even when a cached answer exists" checked={!!runOptions.no_cache} onChange={(v) => setOpt({ no_cache: v || undefined })} />
          <Checkbox label="Force full dataset" hint="ignore sampling and score every row" checked={!!runOptions.full} onChange={(v) => setOpt({ full: v || undefined })} />
          <Checkbox
            label="Allow self-judge"
            hint="a judge from the candidate's own model family tends to prefer its own answers (self-preference bias)"
            checked={!!runOptions.allow_self_judge}
            onChange={(v) => setOpt({ allow_self_judge: v || undefined })}
          />
          <Checkbox label="Skip pre-flight" hint="do not ping the endpoints before starting" checked={!!runOptions.no_preflight} onChange={(v) => setOpt({ no_preflight: v || undefined })} />
        </div>
      </Collapsible>

      {/* -------------------------------------------------------- run */}
      <div className="space-y-2 rounded-lg border border-edge bg-panel p-4">
        {conflicts.length > 0 && (
          <Banner tone="warn" className="py-2 text-xs" data-testid="self-judge-warning">
            The judge shares a model family with candidate{conflicts.length > 1 ? "s" : ""}{" "}
            <span className="font-mono">{conflicts.join(", ")}</span>.
            {runOptions.allow_self_judge
              ? " Allow self-judge is on; expect self-preference bias."
              : " The server will refuse the run unless “Allow self-judge” is enabled in run options."}
          </Banner>
        )}
        {pingFailed && (
          <Banner tone="warn" className="py-2 text-xs" data-testid="ping-warning">
            an endpoint failed the last ping; the run will abort at pre-flight
          </Banner>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={!runEnabled}
            loading={running}
            onClick={onRun}
            data-testid="run-button"
            title={
              runEnabled
                ? "Start the evaluation"
                : validate.status === "loading" || !validateFresh
                  ? "Waiting for validation of the current YAML"
                  : "Fix validation errors first"
            }
          >
            Run evaluation
          </Button>
          <span className="font-mono text-xs text-muted" data-testid="cost-label">{costLabel}</span>
          {!validateFresh && validate.status !== "idle" && (
            <span className="text-xs text-faint">validating current edits…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="text-faint">{k} </span>
      <span className={warn ? "text-warn" : "text-fg"}>{v}</span>
    </div>
  );
}

function PlanSummary({ plan }: { plan: NonNullable<ValidateResponse["plan"]> }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Plan</div>
      <KeyValue
        items={[
          {
            k: "candidates",
            v: (
              <ul className="font-mono text-xs">
                {plan.candidates.map((c) => (
                  <li key={c.name}>
                    {c.name} <span className="text-muted">· {c.provider}{c.model ? ` · ${c.model}` : ""}{c.base_url ? ` @ ${c.base_url}` : ""}{c.temperature != null ? ` · t=${c.temperature}` : ""}</span>
                  </li>
                ))}
              </ul>
            ),
          },
          { k: "metrics", v: <span className="font-mono text-xs">{plan.metrics.join(", ") || "—"}</span> },
          {
            k: "judge",
            v: plan.judge ? (
              <span className="font-mono text-xs">
                {plan.judge.provider}{plan.judge.model ? ` · ${plan.judge.model}` : ""} · mode {plan.judge.mode}
                {plan.judge.decompose ? " · decomposed" : ""}
                {Array.isArray(plan.judge.criteria) ? ` · ${plan.judge.criteria.length} criteria` : plan.judge.criteria != null ? ` · ${plan.judge.criteria} criteria` : ""}
                {plan.judge.ensemble ? " · ensemble" : ""}
              </span>
            ) : (
              <span className="text-xs text-muted">none</span>
            ),
          },
          {
            k: "sampling",
            v: <span className="font-mono text-xs">{plan.sampling.mode}{plan.sampling.sample_size != null ? ` · n=${plan.sampling.sample_size}` : ""}{plan.sampling.seed != null ? ` · seed ${plan.sampling.seed}` : ""}</span>,
          },
          {
            k: "gates",
            v: plan.gates.length ? (
              <ul className="font-mono text-xs">
                {plan.gates.map((g, i) => (
                  <li key={i}>{g.metric} {g.op} {g.threshold}{g.min_samples != null ? ` (min n ${g.min_samples})` : ""}</li>
                ))}
              </ul>
            ) : <span className="text-xs text-muted">none</span>,
          },
          { k: "config hash", v: <span className="font-mono text-xs">{plan.config_hash}</span> },
        ]}
      />
    </div>
  );
}
