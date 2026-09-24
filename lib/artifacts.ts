/**
 * Turning agent steps into thread artifacts (docs/guide.md §7.4).
 *
 * The backend attaches a structured `artifacts` key to `tool_result` steps
 * (§5.1). Old sessions — and a backend without that change — have none, so
 * this module also carries the PARSE FALLBACK: regexes over the free-text
 * results, checked against real trace strings in lib/artifacts.test.ts.
 */

import type { SessionStep, StepArtifacts } from "./api";
import { toolMeta } from "./toolMeta";
import type {
  ChartArtifact,
  DatasetArtifact,
  FileArtifact,
  ReportArtifact,
  TurnArtifacts,
} from "./workspace";

const RE_LOADED = /Loaded '([^']+)'/g;
const RE_REGISTERED = /Registered (?:result|the full breakdown) as '?([\w.-]+)/g;
const RE_SHAPE = /\((\d[\d,]*) rows × (\d[\d,]*) (?:cols|columns)\)/;
const RE_SHAPE_LOOSE = /(\d[\d,]*) rows × (\d[\d,]*) (?:cols|columns)/;
const RE_FILE = /(?:saved|written)(?:\s+'[^']*'(?:\s+\([^)]*\))?)?\s+to\s+(\S+\.(?:png|svg|jpg|jpeg|html|md|csv|parquet))\b/gi;
const RE_REPORT = /\b([\w./-]+_report\.(?:md|html))\b/g;

const PARENT_KEYS = ["name", "names", "left", "right", "dataset", "sources", "datasets"];

export type FileKind = FileArtifact["kind"];

export function fileKind(path: string): FileKind {
  const p = path.toLowerCase();
  if (/_report\.(html|md)$/.test(p)) return "report";
  if (/\.(png|svg|jpe?g)$/.test(p)) return "chart";
  if (/\.(csv|parquet)$/.test(p)) return "table";
  if (/\.(pkl|joblib|onnx|pt|pth)$/.test(p)) return "model";
  return "other";
}

/** Strip a leading "workspace/" or "./" so paths are workspace-relative. */
export function normalizePath(p: string): string {
  let out = p.trim().replace(/^[`'"(]+|[`'",.)]+$/g, "");
  const i = out.indexOf("/workspace/");
  if (out.startsWith("/") && i >= 0) out = out.slice(i + "/workspace/".length);
  out = out.replace(/^\.\//, "").replace(/^workspace\//, "");
  return out;
}

function toInt(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
}

export interface ParsedResult {
  /** dataset names the result reports as loaded / registered */
  datasets: { name: string; rows?: number; cols?: number }[];
  /** workspace-relative file paths mentioned as written */
  files: string[];
}

/** The regex fallback over a free-text tool result. */
export function parseResultText(text: string): ParsedResult {
  const datasets: ParsedResult["datasets"] = [];
  const seen = new Set<string>();
  const shape = RE_SHAPE.exec(text) ?? RE_SHAPE_LOOSE.exec(text);
  const rows = shape ? toInt(shape[1]) : undefined;
  const cols = shape ? toInt(shape[2]) : undefined;
  for (const re of [RE_LOADED, RE_REGISTERED]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      datasets.push({ name, rows, cols });
    }
  }
  const files: string[] = [];
  const fseen = new Set<string>();
  for (const re of [RE_FILE, RE_REPORT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const p = normalizePath(m[1]);
      if (!p || fseen.has(p)) continue;
      fseen.add(p);
      files.push(p);
    }
  }
  return { datasets, files };
}

/** Registered dataset names referenced by a tool input (parents). */
export function parentsFromInput(input: Record<string, unknown> | undefined, known: Set<string>, exclude?: string): string[] {
  const out: string[] = [];
  if (!input) return out;
  for (const key of PARENT_KEYS) {
    const v = input[key];
    const vals = typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    for (const name of vals) {
      if (name === exclude || out.includes(name)) continue;
      if (known.has(name)) out.push(name);
    }
  }
  return out;
}

function inputName(input: Record<string, unknown> | undefined): string | undefined {
  const n = input?.name ?? input?.dataset;
  return typeof n === "string" ? n : undefined;
}

function reportTitle(input: Record<string, unknown> | undefined, path: string): string {
  const t = input?.title;
  if (typeof t === "string" && t.trim()) return t.trim();
  const stem = path.split("/").pop()?.replace(/_report\.(md|html)$/, "") ?? "report";
  return `${stem} report`;
}

function reportStem(path: string): string {
  return path.replace(/\.(md|html)$/, "");
}

/**
 * Artifacts produced by ONE tool_result step. `known` is the set of dataset
 * names registered so far (this turn's and the server's), used to resolve
 * parents in the fallback; it is extended with any new names.
 */
export function artifactsFromStep(step: SessionStep, known: Set<string>): TurnArtifacts {
  const out: TurnArtifacts = { datasets: [], charts: [], reports: [], files: [] };
  if (step.kind !== "tool_result") return out;
  const tool = typeof step.data.tool === "string" ? step.data.tool : "";
  const stepNo = typeof step.data.step === "number" ? step.data.step : 0;
  const input = (step.data.input && typeof step.data.input === "object" ? step.data.input : undefined) as
    | Record<string, unknown>
    | undefined;
  const structured = step.data.artifacts as StepArtifacts | undefined;

  const pushFile = (path: string, kind: FileKind, dataset: string | undefined) => {
    if (kind === "chart") {
      out.charts.push({ id: path, kind: "png", path, dataset, tool, step: stepNo, input });
    } else if (kind === "report") {
      const stem = reportStem(path);
      let rep = out.reports.find((r) => reportStem(r.htmlPath ?? r.mdPath ?? "") === stem);
      if (!rep) {
        rep = { title: reportTitle(input, path), dataset: dataset ?? inputName(input), step: stepNo };
        out.reports.push(rep);
      }
      if (path.endsWith(".html")) rep.htmlPath = path;
      else rep.mdPath = path;
    } else {
      out.files.push({ path, kind, step: stepNo, tool });
    }
  };

  if (structured && (structured.datasets?.length || structured.files?.length)) {
    for (const d of structured.datasets ?? []) {
      out.datasets.push({
        name: d.name,
        rows: d.rows ?? 0,
        cols: d.cols ?? 0,
        parents: Array.isArray(d.parents) ? d.parents : [],
        tool: d.tool ?? tool,
        step: stepNo,
      });
      known.add(d.name);
    }
    for (const f of structured.files ?? []) {
      const path = normalizePath(f.path);
      pushFile(path, (f.kind as FileKind) ?? fileKind(path), f.dataset ?? undefined);
    }
    return out;
  }

  // ---- parse fallback
  const text = typeof step.data.result === "string" ? step.data.result : "";
  // finish_task only echoes the summary; its file mentions belong to earlier steps
  if (!text || text.startsWith("Error") || tool === "finish_task") return out;
  const parsed = parseResultText(text);
  const meta = toolMeta(tool);
  for (const d of parsed.datasets) {
    const parents = parentsFromInput(input, known, d.name);
    out.datasets.push({ name: d.name, rows: d.rows ?? 0, cols: d.cols ?? 0, parents, tool, step: stepNo });
    known.add(d.name);
  }
  // a deriving tool whose result named no dataset still registered <name>_suffix
  if (out.datasets.length === 0 && meta.derives) {
    const src = inputName(input);
    const outName = typeof input?.output_name === "string" ? input.output_name : undefined;
    const guess =
      outName ??
      (src && tool === "pivot_dataset"
        ? `${src}_pivot`
        : src && tool === "group_dataset"
          ? `${src}_grouped`
          : src && tool === "apply_cleaning"
            ? `${src}_clean`
            : src && tool === "engineer_features"
              ? `${src}_features`
              : undefined);
    if (guess && new RegExp(`'${guess.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`).test(text)) {
      const shape = RE_SHAPE_LOOSE.exec(text);
      out.datasets.push({
        name: guess,
        rows: shape ? toInt(shape[1]) : 0,
        cols: shape ? toInt(shape[2]) : 0,
        parents: parentsFromInput(input, known, guess),
        tool,
        step: stepNo,
      });
      known.add(guess);
    }
  }
  const chartDataset = inputName(input) && known.has(inputName(input) as string) ? inputName(input) : inputName(input);
  for (const path of parsed.files) pushFile(path, fileKind(path), chartDataset);
  return out;
}

/** Merge one step's artifacts into a turn's accumulated set (stable order, no dupes). */
export function mergeArtifacts(acc: TurnArtifacts, add: TurnArtifacts): TurnArtifacts {
  if (!add.datasets.length && !add.charts.length && !add.reports.length && !add.files.length) return acc;
  const datasets = [...acc.datasets];
  for (const d of add.datasets) {
    const i = datasets.findIndex((x) => x.name === d.name);
    if (i >= 0) datasets[i] = { ...datasets[i], rows: d.rows || datasets[i].rows, cols: d.cols || datasets[i].cols };
    else datasets.push(d);
  }
  const charts = [...acc.charts];
  for (const c of add.charts) if (!charts.some((x) => x.id === c.id)) charts.push(c);
  const reports = [...acc.reports];
  for (const r of add.reports) {
    const key = reportStem(r.htmlPath ?? r.mdPath ?? "");
    const i = reports.findIndex((x) => reportStem(x.htmlPath ?? x.mdPath ?? "") === key);
    if (i >= 0) {
      const cur = reports[i];
      reports[i] = {
        ...cur,
        htmlPath: cur.htmlPath ?? r.htmlPath,
        mdPath: cur.mdPath ?? r.mdPath,
        dataset: cur.dataset ?? r.dataset,
        title: cur.title.endsWith(" report") && !r.title.endsWith(" report") ? r.title : cur.title,
      };
    } else reports.push(r);
  }
  const files = [...acc.files];
  for (const f of add.files) if (!files.some((x) => x.path === f.path)) files.push(f);
  return { datasets, charts, reports, files };
}

/** Rebuild a turn's artifacts from a full step list (persisted traces). */
export function artifactsFromSteps(steps: SessionStep[], known: Set<string> = new Set()): TurnArtifacts {
  // tool_result steps carry no `input`; borrow it from the matching tool_call
  const inputs = new Map<string, Record<string, unknown>>();
  let acc: TurnArtifacts = { datasets: [], charts: [], reports: [], files: [] };
  for (const s of steps) {
    if (s.kind === "tool_call" && s.data.input && typeof s.data.input === "object") {
      inputs.set(`${s.data.step}:${s.data.tool}`, s.data.input as Record<string, unknown>);
    }
    if (s.kind !== "tool_result") continue;
    const withInput = s.data.input
      ? s
      : { ...s, data: { ...s.data, input: inputs.get(`${s.data.step}:${s.data.tool}`) } };
    acc = mergeArtifacts(acc, artifactsFromStep(withInput, known));
  }
  return acc;
}

export type { DatasetArtifact, ChartArtifact, ReportArtifact, FileArtifact };
