/**
 * One map from an agent tool name to how the UI presents it: the step label
 * while it runs, the gutter icon kind, and the chart kind its output draws
 * (docs/guide.md §7.4). Anything not listed falls back to a generic entry.
 */

import type { SessionStep } from "./api";

export type ChartKind = "bar" | "histogram" | "line" | "scatter" | "grid" | "pie" | "chart";

/** Icon families for thinking-step rows (§2.4). */
export type StepIcon = "code" | "search" | "chart" | "sparkle" | "table" | "report" | "model" | "error" | "warning";

export interface ToolMeta {
  /** present-tense label while the step runs, e.g. "running code…" */
  label: string;
  icon: StepIcon;
  /** the kind of chart the tool draws, when it draws one */
  chart?: ChartKind;
  /** the tool registers a new dataset */
  derives?: boolean;
}

export const TOOL_META: Record<string, ToolMeta> = {
  // files & control
  list_files: { label: "listing files…", icon: "search" },
  read_file: { label: "reading a file…", icon: "search" },
  write_file: { label: "writing a file…", icon: "code" },
  finish_task: { label: "wrapping up…", icon: "sparkle" },
  // code
  run_python: { label: "running code…", icon: "code" },
  run_shell: { label: "running a shell command…", icon: "code" },
  install_package: { label: "installing packages…", icon: "code" },
  // search
  index_project: { label: "indexing the project…", icon: "search" },
  search_codebase: { label: "searching the index…", icon: "search" },
  index_pdf: { label: "indexing a PDF…", icon: "search" },
  index_image: { label: "indexing an image…", icon: "search" },
  index_audio: { label: "transcribing audio…", icon: "search" },
  list_sessions: { label: "recalling sessions…", icon: "search" },
  recall_session: { label: "recalling a session…", icon: "search" },
  // loading
  load_csv: { label: "loading a CSV…", icon: "table", derives: true },
  load_excel: { label: "loading a sheet…", icon: "table", derives: true },
  load_parquet: { label: "loading Parquet…", icon: "table", derives: true },
  load_sql: { label: "querying the database…", icon: "table", derives: true },
  load_cloud_data: { label: "loading cloud data…", icon: "table", derives: true },
  inspect_workbook: { label: "inspecting the workbook…", icon: "search" },
  load_workbook: { label: "loading every sheet…", icon: "table", derives: true },
  list_datasets: { label: "listing datasets…", icon: "search" },
  preview_dataset: { label: "previewing rows…", icon: "search" },
  validate_dataset: { label: "validating the data…", icon: "search" },
  describe_dataset: { label: "describing the data…", icon: "search" },
  save_dataset: { label: "saving a dataset…", icon: "table" },
  // cleaning
  clean_dataset: { label: "diagnosing the data…", icon: "search" },
  apply_cleaning: { label: "applying the cleaning plan…", icon: "table", derives: true },
  ask_human: { label: "asking you a question…", icon: "sparkle" },
  // analysis & charts
  analyze_dataset: { label: "analysing the dataset…", icon: "search" },
  plot_column: { label: "plotting a column…", icon: "chart", chart: "histogram" },
  plot_relationship: { label: "plotting a relationship…", icon: "chart", chart: "scatter" },
  analyze_correlations: { label: "computing correlations…", icon: "chart", chart: "grid" },
  check_subgroups: { label: "checking subgroups…", icon: "chart", chart: "bar" },
  compare_groups: { label: "comparing groups…", icon: "search" },
  rank_by: { label: "ranking groups…", icon: "search" },
  analyze_missing: { label: "analysing blanks…", icon: "chart", chart: "grid" },
  analyze_multivalue: { label: "splitting list values…", icon: "search" },
  pivot_dataset: { label: "pivoting…", icon: "table", derives: true },
  group_dataset: { label: "grouping…", icon: "table", derives: true },
  analyze_over_time: { label: "analysing over time…", icon: "chart", chart: "line" },
  measure_duration: { label: "measuring durations…", icon: "search" },
  join_datasets: { label: "joining datasets…", icon: "table", derives: true },
  // reporting
  write_report: { label: "composing the report…", icon: "report" },
  // ML
  profile_features: { label: "profiling features…", icon: "search" },
  engineer_features: { label: "engineering features…", icon: "table", derives: true },
  train_models: { label: "training models…", icon: "model" },
  tune_hyperparameters: { label: "tuning hyperparameters…", icon: "model" },
  list_trained_models: { label: "listing models…", icon: "search" },
  evaluate_model: { label: "evaluating the model…", icon: "model" },
  compare_models: { label: "comparing models…", icon: "chart", chart: "bar" },
  feature_importance: { label: "ranking features…", icon: "chart", chart: "bar" },
  plot_confusion_matrix: { label: "plotting the confusion matrix…", icon: "chart", chart: "grid" },
  plot_roc_curve: { label: "plotting the ROC curve…", icon: "chart", chart: "line" },
  plot_residuals: { label: "plotting residuals…", icon: "chart", chart: "scatter" },
  predict: { label: "predicting…", icon: "model" },
  save_model: { label: "saving the model…", icon: "model" },
  delete_model: { label: "deleting a model…", icon: "model" },
  package_model: { label: "packaging the model…", icon: "model" },
  solve_ml_task: { label: "searching solutions…", icon: "model" },
  // documents
  extract_pdf_structured: { label: "extracting PDF tables…", icon: "search" },
  extract_pdf_document: { label: "reading the PDF…", icon: "search" },
  swarn_pdf_to_csv: { label: "converting tables to CSV…", icon: "table" },
  swarn_doc_ingest: { label: "ingesting the document…", icon: "search" },
  swarn_doc_ask: { label: "answering from the document…", icon: "search" },
  swarn_doc_inspect: { label: "inspecting the document…", icon: "search" },
};

const GENERIC: ToolMeta = { label: "working…", icon: "sparkle" };

export function toolMeta(tool: string | undefined | null): ToolMeta {
  if (!tool) return GENERIC;
  const hit = TOOL_META[tool];
  if (hit) return hit;
  if (tool.startsWith("mcp_")) return { label: `calling ${tool}…`, icon: "sparkle" };
  return { label: `running ${tool}…`, icon: "sparkle" };
}

export function chartKindFor(tool: string | undefined | null): ChartKind {
  return toolMeta(tool).chart ?? "chart";
}

/** Human label for a step in the thinking-steps banner (§2.4). */
export function stepLabel(step: SessionStep | undefined): string {
  if (!step) return "";
  const tool = typeof step.data.tool === "string" ? step.data.tool : undefined;
  switch (step.kind) {
    case "plan":
      return "planning…";
    case "tool_call":
      return toolMeta(tool).label;
    case "tool_result":
      return tool ? `${tool} finished` : "step finished";
    case "correction":
      return `retrying ${tool ?? "a tool"}`;
    case "complete":
      return "done";
    case "error":
      return String(step.data.reason ?? "hit an error");
    default:
      return step.kind;
  }
}

/** The icon family for a step row (§2.4 table). */
export function stepIcon(step: SessionStep): StepIcon {
  if (step.kind === "error") return "error";
  if (step.kind === "correction") return "warning";
  if (step.kind === "plan" || step.kind === "complete") return "sparkle";
  const tool = typeof step.data.tool === "string" ? step.data.tool : undefined;
  return toolMeta(tool).icon;
}

/** A short "Ran N tools: a, b, …" summary for the plan line fallback. */
export function toolsSummary(steps: SessionStep[]): string {
  const names: string[] = [];
  let n = 0;
  for (const s of steps) {
    if (s.kind !== "tool_call") continue;
    n += 1;
    const t = typeof s.data.tool === "string" ? s.data.tool : "tool";
    if (!names.includes(t)) names.push(t);
  }
  if (n === 0) return "";
  const shown = names.slice(0, 5).join(", ");
  return `Ran ${n} tool${n === 1 ? "" : "s"}: ${shown}${names.length > 5 ? ", …" : ""}`;
}
