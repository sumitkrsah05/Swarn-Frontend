/**
 * Pure helpers for the LLM-evaluation screens: the behaviour rules from
 * docs/eval_guide.md §5, number formatting, gate/CI reasoning, mock-baseline
 * sanity checks, YAML surgery for the "disable thinking" fix, and the
 * wizard's sessionStorage draft.
 */

import { isMap, isSeq, parseDocument, YAMLMap } from "yaml";
import type {
  CandidateSummary,
  EvalConfig,
  GateConfig,
  GateResult,
  MetricInfo,
  ModelConfig,
  Plan,
  RunOptions,
} from "@/api/types";

// ------------------------------------------------------------- formatting

export function fmtNum(n: number | null | undefined, digits = 3): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function fmtCi(
  lo: number | null | undefined,
  hi: number | null | undefined,
  digits = 3,
): string {
  if (lo == null || hi == null) return "[—, —]";
  return `[${lo.toFixed(digits)}, ${hi.toFixed(digits)}]`;
}

export function fmtLatency(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return "—";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  return `${seconds.toFixed(2)} s`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString();
}

export function truncate(text: string | null | undefined, max = 80): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --------------------------------------------------- §5.1 self-judge rule

/** Family prefix: text before the first `-`, `/` or digit, lower-cased. */
export function modelFamily(model: string | null | undefined): string {
  if (!model) return "";
  const m = /^[^-/\d]*/.exec(model.trim());
  return (m ? m[0] : "").trim().toLowerCase();
}

/** Candidate names whose model family matches the judge's. */
export function selfJudgeConflicts(plan: Plan | null | undefined): string[] {
  if (!plan?.judge?.model) return [];
  const judgeFamily = modelFamily(plan.judge.model);
  if (!judgeFamily) return [];
  return plan.candidates
    .filter((c) => c.model && modelFamily(c.model) === judgeFamily)
    .map((c) => c.name);
}

// --------------------------------------------- §5.2 hidden-reasoning fix

export const HIDDEN_REASONING_RE = /hidden reasoning/i;

export function mentionsHiddenReasoning(
  text: string | null | undefined,
): boolean {
  return !!text && HIDDEN_REASONING_RE.test(text);
}

export interface YamlModelRef {
  role: "candidate" | "judge";
  /** candidate name (undefined for the judge) */
  name?: string;
  label: string;
}

/** Models mentioned by the YAML, for the "apply fix to…" chooser. */
export function listYamlModels(yamlText: string): YamlModelRef[] {
  const out: YamlModelRef[] = [];
  try {
    const doc = parseDocument(yamlText);
    const candidates = doc.get("candidates");
    if (isSeq(candidates)) {
      for (const item of candidates.items) {
        if (!isMap(item)) continue;
        const name = item.get("name");
        if (typeof name === "string") {
          out.push({ role: "candidate", name, label: `candidate ${name}` });
        }
      }
    }
    if (doc.hasIn(["judge", "model"])) {
      out.push({ role: "judge", label: "judge model" });
    }
  } catch {
    /* unparsable YAML — nothing to offer */
  }
  return out;
}

/**
 * Adds `extra: {chat_template_kwargs: {enable_thinking: false}}` to one
 * model in the YAML, preserving comments and the rest of the document.
 * Returns the original text unchanged when the target cannot be found.
 */
export function applyThinkingFix(yamlText: string, target: YamlModelRef): string {
  let doc;
  try {
    doc = parseDocument(yamlText);
  } catch {
    return yamlText;
  }
  const path = ["extra", "chat_template_kwargs", "enable_thinking"];
  if (target.role === "judge") {
    const model = doc.getIn(["judge", "model"]);
    if (!isMap(model)) return yamlText;
    (model as YAMLMap).setIn(path, false);
    return doc.toString();
  }
  const candidates = doc.get("candidates");
  if (!isSeq(candidates)) return yamlText;
  for (const item of candidates.items) {
    if (isMap(item) && item.get("name") === target.name) {
      item.setIn(path, false);
      return doc.toString();
    }
  }
  return yamlText;
}

// ------------------------------------------ §5.3 gates vs confidence bands

export interface GateRef {
  candidate: string;
  metric: string;
  stat: string;
}

/** "gemma-4-31b/judge_rubric.mean" → {candidate, metric, stat}. */
export function parseGateRef(ref: string | null | undefined): GateRef | null {
  if (!ref) return null;
  const m = /^\s*([^/\s]+)\/([^.\s]+)\.([A-Za-z_]+)/.exec(ref);
  if (!m) return null;
  return { candidate: m[1], metric: m[2], stat: m[3] };
}

/** Threshold for a gate result: from the config's gates, else from the text. */
export function gateThreshold(
  gate: GateResult,
  configGates: GateConfig[] | undefined,
): number | null {
  const ref = parseGateRef(gate.gate);
  if (ref && configGates) {
    const hit = configGates.find((g) => {
      const r = parseGateRef(g.metric);
      return (
        r &&
        r.candidate === ref.candidate &&
        r.metric === ref.metric &&
        r.stat === ref.stat
      );
    });
    if (hit && typeof hit.threshold === "number") return hit.threshold;
  }
  const m = /(?:>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)/.exec(gate.gate);
  if (m) return parseFloat(m[1]);
  const r = /threshold\s*[=:]?\s*(-?\d+(?:\.\d+)?)/i.exec(gate.reason ?? "");
  return r ? parseFloat(r[1]) : null;
}

export const NOT_DECISIVE = "not decisive at this sample size";

/** True when the gate's threshold lies inside the metric's 95% CI. */
export function gateInsideCi(
  gate: GateResult,
  configGates: GateConfig[] | undefined,
  candidates: Record<string, CandidateSummary> | undefined,
): boolean {
  const ref = parseGateRef(gate.gate);
  const threshold = gateThreshold(gate, configGates);
  if (!ref || threshold == null || !candidates) return false;
  const metric = candidates[ref.candidate]?.metrics?.[ref.metric];
  if (!metric || metric.ci95_low == null || metric.ci95_high == null) {
    return false;
  }
  return threshold >= metric.ci95_low && threshold <= metric.ci95_high;
}

// ---------------------------------------- §5.4 failure rate & §5.5 mocks

export const FAILURE_RATE_CAVEAT =
  "metrics cover only samples that produced output";

export function isMockName(name: string): boolean {
  return /^mock-/i.test(name);
}

/** Real candidates first (stable), then mock-* candidates. */
export function orderCandidates(names: string[]): string[] {
  return [...names.filter((n) => !isMockName(n)), ...names.filter(isMockName)];
}

export function isJudgeMetric(
  name: string,
  catalog?: MetricInfo[] | null,
): boolean {
  const hit = catalog?.find((m) => m.name === name);
  if (hit) return hit.needs_judge || hit.group === "judge";
  return /^judge/i.test(name);
}

export const MOCK_BANNER =
  "the judge or rubric is not discriminating; do not trust the candidate scores";

/**
 * Problems with the mock self-test: mock-perfect below 0.95 or mock-echo
 * above 0.2 on any judge metric. Empty when everything is fine.
 */
export function mockSanityProblems(
  candidates: Record<string, { metrics: Record<string, { mean: number | null }> }>,
  catalog?: MetricInfo[] | null,
): string[] {
  const problems: string[] = [];
  for (const [name, c] of Object.entries(candidates)) {
    for (const [metric, m] of Object.entries(c.metrics ?? {})) {
      if (m.mean == null || !isJudgeMetric(metric, catalog)) continue;
      if (/^mock-perfect$/i.test(name) && m.mean < 0.95) {
        problems.push(`${name}/${metric} mean ${fmtNum(m.mean)} < 0.95`);
      }
      if (/^mock-echo$/i.test(name) && m.mean > 0.2) {
        problems.push(`${name}/${metric} mean ${fmtNum(m.mean)} > 0.20`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------- §4.3 calibration bands

export type AgreementBand = "strong" | "moderate" | "unreliable";

export function agreementBand(v: number | null | undefined): AgreementBand | null {
  if (v == null || !isFinite(v)) return null;
  if (v >= 0.8) return "strong";
  if (v >= 0.6) return "moderate";
  return "unreliable";
}

// ------------------------------------------------------------ wizard draft

export const WIZARD_STORAGE_KEY = "swarn:eval:wizard:v1";

export type WizardStep = 1 | 2 | 3;

export interface WizardDraft {
  step: WizardStep;
  goal: string;
  datasetPath: string;
  candidates: ModelConfig[];
  addMocks: boolean;
  yaml: string;
  design: { rationale: string; notes: string[] } | null;
  runOptions: RunOptions;
  jobId: string | null;
}

export const EMPTY_DRAFT: WizardDraft = {
  step: 1,
  goal: "",
  datasetPath: "",
  candidates: [],
  addMocks: true,
  yaml: "",
  design: null,
  runOptions: {},
  jobId: null,
};

export function loadWizardDraft(): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function saveWizardDraft(draft: WizardDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function clearWizardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const MOCK_CANDIDATES: ModelConfig[] = [
  { name: "mock-perfect", provider: "mock", mock_behavior: "reference" },
  { name: "mock-echo", provider: "mock", mock_behavior: "echo" },
];

export const GOAL_PLACEHOLDER =
  "Does <model> answer <dataset> correctly? Gate at 80%.";

// ------------------------------------------------------------ misc config

/** Candidate names declared in a config (for the results filter etc.). */
export function configCandidateNames(config: EvalConfig | null | undefined) {
  return (config?.candidates ?? [])
    .map((c) => c.name)
    .filter((n): n is string => typeof n === "string");
}
