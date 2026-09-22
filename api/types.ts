/**
 * TypeScript shapes for the swarn LLM-evaluation API (docs/eval_guide.md §3).
 * Every response the eval UI consumes is typed here; api/client.ts exposes one
 * function per endpoint that returns these shapes.
 */

// ------------------------------------------------------------- common

export type JobStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export type RunStatus = "complete" | "incomplete" | "empty";

/** `{"detail": "..."}` bodies on 4xx are surfaced verbatim via ApiError. */
export interface ApiErrorBody {
  detail: string;
}

// ---------------------------------------------------------- §3.1 form data

export interface DatasetEntry {
  /** value for `dataset.path` in the config */
  path: string;
  name: string;
  size: number;
  rows: number | null;
  /** unix seconds */
  modified: number;
}

export interface DatasetsResponse {
  datasets: DatasetEntry[];
  workspace: string;
}

export interface DeployedEndpoint {
  provider: "deployed";
  model: string;
  base_url: string;
}

export interface EndpointsResponse {
  deployed: DeployedEndpoint;
  /** environment-variable NAMES usable as `api_key_env` — never key values */
  api_key_envs: string[];
  providers: string[];
}

export type MetricGroup =
  | "deterministic"
  | "embedding"
  | "code"
  | "judge"
  | "rag"
  | "safety"
  | "trajectory";

export interface MetricInfo {
  name: string;
  group: MetricGroup;
  needs_judge: boolean;
}

export interface MetricsResponse {
  metrics: MetricInfo[];
}

// --------------------------------------------------------- §3.7 ModelConfig

export type Provider =
  | "deployed"
  | "openai-compatible"
  | "anthropic"
  | "hf-local"
  | "mock";

export type MockBehavior = "reference" | "echo" | "fixed" | "fail";

export interface ModelConfig {
  name?: string;
  provider: Provider;
  model?: string;
  base_url?: string;
  api_key_env?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_s?: number;
  rpm?: number;
  system_prompt?: string;
  prompt_template?: string;
  extra?: Record<string, unknown>;
  /** only with provider "mock" */
  mock_behavior?: MockBehavior;
}

// -------------------------------------------------------- §3.8 eval config

export interface RubricItem {
  name: string;
  description: string;
  scale?: number;
  binary?: boolean;
  weight?: number;
}

export interface JudgeConfig {
  model: ModelConfig;
  mode?: string;
  decompose?: boolean;
  pass_threshold?: number;
  rubric?: RubricItem[];
  [key: string]: unknown;
}

export interface MetricConfig {
  name: string;
  pass_threshold?: number;
  [key: string]: unknown;
}

export type GateOp = ">=" | ">" | "<=" | "<" | "==" | "!=";

export interface GateConfig {
  /** "candidate/metric.stat", e.g. "gemma-4-31b/judge_rubric.mean" */
  metric: string;
  op: GateOp | string;
  threshold: number;
  min_samples?: number;
}

export interface EvalConfig {
  goal?: string;
  dataset?: {
    path: string;
    field_mapping?: Record<string, unknown>;
    [key: string]: unknown;
  };
  candidates?: ModelConfig[];
  judge?: JudgeConfig;
  metrics?: MetricConfig[];
  sampling?: { mode?: string; sample_size?: number; seed?: number };
  execution?: { concurrency?: number; budget_usd?: number; preflight?: boolean };
  gates?: GateConfig[];
  reporting?: { formats?: string[]; slice_by?: string[] };
  [key: string]: unknown;
}

/** §3.2 — every config-taking endpoint accepts exactly one of these. */
export type ConfigBody = { config: EvalConfig } | { yaml: string };

// ------------------------------------------------------ §3.3 design/checks

export interface DesignRequest {
  goal: string;
  dataset_path: string;
  candidates?: ModelConfig[];
  train_path?: string;
}

export interface PlanCandidate {
  name: string;
  provider: string;
  model: string | null;
  base_url: string | null;
  temperature: number | null;
}

export interface PlanJudge {
  provider: string;
  model: string | null;
  base_url: string | null;
  mode: string;
  criteria: string[] | number | null;
  decompose: boolean;
  ensemble: unknown;
}

export interface PlanSampling {
  mode: string;
  sample_size: number | null;
  seed: number | null;
}

export interface PlanGate {
  metric: string;
  op: string;
  threshold: number;
  min_samples: number | null;
}

export interface Plan {
  candidates: PlanCandidate[];
  metrics: string[];
  judge: PlanJudge | null;
  sampling: PlanSampling;
  gates: PlanGate[];
  config_hash: string;
}

export interface DesignResponse {
  config: EvalConfig;
  yaml: string;
  rationale: string;
  notes: string[];
  plan: Plan;
}

export interface DatasetProfile {
  total_rows: number;
  valid_rows: number;
  malformed: number;
  exact_duplicates: number;
  near_duplicates: number;
  oversized: number;
  avg_input_tokens: number;
  avg_reference_tokens: number;
  [key: string]: unknown;
}

export interface ValidateResponse {
  ok: boolean;
  errors: string[];
  warnings: string[];
  dataset: DatasetProfile | null;
  lines: string[];
  plan: Plan | null;
}

export interface EstimateModel {
  name: string;
  requests: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  [key: string]: unknown;
}

export interface EstimateResponse {
  rows: number;
  sampled: boolean;
  models: EstimateModel[];
  judge: EstimateModel | null;
  total_cost_usd: number;
  total_requests: number;
  est_minutes: number;
  lines: string[];
  budget_usd: number | null;
  exceeds_budget: boolean;
}

export type PingRole = "candidate" | "judge" | "judge-ensemble";

export interface PingCheck {
  role: PingRole;
  name: string;
  provider: string;
  model: string | null;
  base_url: string | null;
  /** null = skipped (mock or local model) */
  ok: boolean | null;
  latency_s: number | null;
  error: string | null;
  reply: string | null;
}

export interface PingResponse {
  ok: boolean;
  checks: PingCheck[];
}

// ------------------------------------------------------------- §3.4 runs

export interface RunOptions {
  label?: string;
  no_cache?: boolean;
  max_cost_usd?: number;
  full?: boolean;
  allow_self_judge?: boolean;
  no_preflight?: boolean;
}

export type RunRequest = ConfigBody & RunOptions;

export interface ResumeRequest {
  add?: number;
  max_cost_usd?: number;
}

export interface JobEvent {
  ts: number;
  type: "status" | "progress" | "cancel_requested" | string;
  /** type "status" */
  status?: JobStatus;
  /** type "progress" */
  message?: string;
  [key: string]: unknown;
}

export interface JobSummary {
  id: string;
  task: string;
  method: "eval" | string;
  status: JobStatus;
  created: number;
  started: number | null;
  finished: number | null;
  cancel_requested: boolean;
  /** set as soon as the run directory exists, before completion */
  run_id: string | null;
  n_events: number;
  last_event: JobEvent | null;
  pending_approvals: unknown[];
}

export interface GateResult {
  gate: string;
  value: number | null;
  passed: boolean | null;
  reason: string;
}

export interface ResultCandidateMetric {
  mean: number | null;
  pass_rate: number | null;
}

export interface ResultCandidate {
  samples: number;
  failure_rate: number;
  cost_usd: number;
  metrics: Record<string, ResultCandidateMetric>;
}

export interface EvalJobResult {
  method: "eval";
  run_id: string;
  run_dir: string;
  goal: string;
  candidates: Record<string, ResultCandidate>;
  gates: GateResult[];
  gates_passed: boolean | null;
  caveats: string[];
  report_url: string;
}

export interface JobDetail extends JobSummary {
  result: EvalJobResult | null;
  error: string | null;
  events: JobEvent[];
  events_from: number;
}

/** One message on WS /ws/live (filter `method === "eval"`). */
export interface JobFrame {
  channel: "job";
  job_id: string;
  method: string;
  status: JobStatus;
  task: string;
  event: JobEvent;
}

// ------------------------------------------------------ §3.5 reading runs

export interface HeadlineMetric {
  mean: number | null;
  ci95: [number, number] | null;
  pass_rate: number | null;
}

export interface HeadlineCandidate {
  samples: number;
  failure_rate: number;
  cost_usd: number;
  metrics: Record<string, HeadlineMetric>;
}

export interface RunListItem {
  run_id: string;
  status: RunStatus;
  goal: string;
  created: number;
  candidates: string[];
  headline: Record<string, HeadlineCandidate> | null;
  gates_passed: boolean | null;
  job: JobSummary | null;
}

export interface RunsResponse {
  runs: RunListItem[];
  root: string;
}

export interface CandidateMetric {
  mean: number | null;
  ci95_low: number | null;
  ci95_high: number | null;
  n: number;
  errors: number;
  pass_rate: number | null;
}

export interface SliceMetric {
  mean: number | null;
  ci95_low: number | null;
  ci95_high: number | null;
  n: number;
}

/** slices: field → value → metric → stats */
export type CandidateSlices = Record<
  string,
  Record<string, Record<string, SliceMetric>>
>;

export interface CandidateSummary {
  samples: number;
  failures: number;
  failure_rate: number;
  cost_usd: number;
  cache_hits: number;
  latency_s_avg: number | null;
  tokens_in: number;
  tokens_out: number;
  pass_rate: number | null;
  metrics: Record<string, CandidateMetric>;
  slices: CandidateSlices;
}

export interface ComparisonMetric {
  delta: number | null;
  ci: [number, number] | null;
  test: string | null;
  p: number | null;
  verdict: string;
  [key: string]: unknown;
}

export interface Comparison {
  a: string;
  b: string;
  n_shared: number;
  metrics: Record<string, ComparisonMetric>;
}

export interface Calibration {
  kappa: number | null;
  spearman: number | null;
  n: number;
  [key: string]: unknown;
}

export interface JudgeDiagnostics {
  verbosity_bias_corr: number | null;
  format_bias: unknown;
  pairwise_flip_rates: unknown;
  calibration: Calibration | null;
  [key: string]: unknown;
}

export interface Stage2Recommendation {
  additional_rows: number;
  reason: string;
}

export interface RunSummary {
  run_id: string;
  goal: string;
  generated_at: string | number;
  seed: number | null;
  sampled: boolean;
  dataset_rows_used: number;
  config_hash: string;
  dataset_hash: string;
  candidates: Record<string, CandidateSummary>;
  comparisons: Comparison[];
  gates: GateResult[];
  gates_passed: boolean | null;
  caveats: string[];
  failure_analysis: Record<string, unknown> | null;
  judge_diagnostics: JudgeDiagnostics | null;
  stage2_recommendation: Stage2Recommendation | null;
  environment: Record<string, unknown> | null;
}

export interface Checkpoint {
  cost_so_far: number;
  selected_ids: string[];
  seed: number | null;
}

export interface RunDetail {
  run_id: string;
  status: RunStatus;
  summary: RunSummary | null;
  config: EvalConfig | null;
  checkpoint: Checkpoint | null;
  /** e.g. {"report.md": true, "report.html": false} */
  artifacts: Record<string, boolean>;
  job: JobSummary | null;
}

export interface RebuildReportResponse {
  run_id: string;
  summary: RunSummary;
}

export interface JudgeRubricDetail {
  reasoning: string;
  criteria: Record<string, { verdict: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface ResultRow {
  candidate: string;
  sample_id: string;
  input: string;
  output: string | null;
  reference: string | null;
  scores: Record<string, number>;
  passed: Record<string, boolean>;
  metric_details: {
    judge_rubric?: JudgeRubricDetail;
    [key: string]: unknown;
  };
  metric_errors: Record<string, string>;
  error: string | null;
  latency_s: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  cached: boolean;
  metadata: Record<string, unknown>;
}

export interface ResultsQuery {
  candidate?: string;
  sample_id?: string;
  only_failed?: boolean;
  offset?: number;
  /** ≤ 500 */
  limit?: number;
}

export interface ResultsResponse {
  run_id: string;
  total: number;
  offset: number;
  limit: number;
  rows: ResultRow[];
}

export interface RunFile {
  path: string;
  size: number;
}

export interface FilesResponse {
  run_id: string;
  files: RunFile[];
}

export interface DeleteResponse {
  deleted: string | boolean;
}

// ------------------------------------------------------- §3.6 across runs

export interface CompareRequest {
  run: string;
  baseline: string;
  max_drop?: number;
  p_value?: number;
}

export interface ComparePair {
  candidate: string;
  metric: string;
  delta: number | null;
  ci: [number, number] | null;
  test: string | null;
  p: number | null;
  verdict: string;
  [key: string]: unknown;
}

export interface CompareResponse {
  baseline_run: string;
  candidate_run: string;
  pairs: ComparePair[];
  regressions: ComparePair[];
  warnings: string[];
  passed: boolean;
  markdown: string;
}

export type CalibrateLabel =
  | { sample_id: string; human_pass: boolean }
  | { sample_id: string; human_score: number };

export interface CalibrateRequest {
  labels: CalibrateLabel[];
}

export interface CalibrateResponse {
  run_id: string;
  calibration: Calibration;
}
