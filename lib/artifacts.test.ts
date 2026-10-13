import { describe, expect, it } from "vitest";
import trace from "../test/fixtures/trace-ab2bb1db.json";
import type { SessionStep } from "./api";
import { artifactsFromStep, artifactsFromSteps, fileKind, mergeArtifacts, normalizePath, parentsFromInput, parseResultText, specPathFor } from "./artifacts";

const steps = (trace as { steps: SessionStep[] }).steps;

describe("parse fallback against the real trace (sessions/ab2bb1db-…)", () => {
  it("reproduces the cards of the session", () => {
    const a = artifactsFromSteps(steps);
    expect(a.datasets).toEqual([{ name: "saas_metrics", rows: 9, cols: 7, parents: [], tool: "load_csv", step: 2 }]);
    expect(a.charts.map((c) => c.path)).toEqual(["plots/saas_metrics__Active_Users_distribution.png", "plots/saas_metrics__correlations.png"]);
    expect(a.charts[0]).toMatchObject({ kind: "png", dataset: "saas_metrics", tool: "plot_column", step: 5 });
    expect(a.charts[1]).toMatchObject({ kind: "png", dataset: "saas_metrics", tool: "analyze_correlations", step: 7 });
    expect(a.reports).toEqual([
      { title: "Q3 SaaS Product Metrics Analysis", dataset: "saas_metrics", step: 15, mdPath: "saas_metrics_report.md", htmlPath: "saas_metrics_report.html" },
    ]);
    expect(a.files).toEqual([]);
  });

  it("does not turn the finish_task echo into artifacts", () => {
    const finish = steps.find((s) => s.kind === "tool_result" && s.data.tool === "finish_task") as SessionStep;
    const a = artifactsFromStep(finish, new Set(["saas_metrics"]));
    expect(a.datasets).toEqual([]);
    expect(a.charts).toEqual([]);
    // the summary mentions the report files; they stay attached to write_report's step, not here
    expect(a.reports.length).toBeLessThanOrEqual(1);
  });
});

describe("parseResultText", () => {
  it("reads Loaded '…' with its shape", () => {
    const r = parseResultText("Loaded 'sales' from csv:uploads/1/sales.csv  (1,204 rows × 12 cols)\nColumns: a, b");
    expect(r.datasets).toEqual([{ name: "sales", rows: 1204, cols: 12 }]);
  });

  it("reads Registered result as … (join and cleaner wording)", () => {
    expect(parseResultText("Registered result as 'orders_x_customers': 5,000 rows × 9 columns.").datasets).toEqual([{ name: "orders_x_customers", rows: 5000, cols: 9 }]);
    expect(parseResultText("Registered result as 'sales_clean'. Original 'sales' untouched.\n(340 rows × 8 cols)").datasets[0]).toMatchObject({ name: "sales_clean", rows: 340, cols: 8 });
    expect(parseResultText("  Registered the full breakdown as 'genres_split'.").datasets[0].name).toBe("genres_split");
  });

  it("reads saved / written file paths and bare report names", () => {
    const r = parseResultText(
      "Correlation heatmap saved to plots/x__correlations.png\nTrend chart saved to workspace/plots/t.png\nSaved 'x' (9 rows) to out/x.csv\nReport written for 'x':\n  x_report.md    — for git\n  x_report.html  — self-contained",
    );
    expect(r.files).toEqual(["plots/x__correlations.png", "plots/t.png", "out/x.csv", "x_report.md", "x_report.html"]);
  });
});

describe("helpers", () => {
  it("classifies files", () => {
    expect(fileKind("plots/a.png")).toBe("chart");
    expect(fileKind("a_report.html")).toBe("report");
    expect(fileKind("out/a.parquet")).toBe("table");
    expect(fileKind("artifacts/m.pkl")).toBe("model");
    expect(fileKind("notes.txt")).toBe("other");
  });

  it("normalises workspace paths", () => {
    expect(normalizePath("/home/u/agent2/workspace/plots/a.png")).toBe("plots/a.png");
    expect(normalizePath("./workspace/a.md,")).toBe("a.md");
    expect(normalizePath("`plots/b.png`")).toBe("plots/b.png");
  });

  it("finds parents in the tool input", () => {
    const known = new Set(["sales", "regions", "sales_pivot"]);
    expect(parentsFromInput({ name: "sales", output_name: "sales_pivot" }, known, "sales_pivot")).toEqual(["sales"]);
    expect(parentsFromInput({ left: "sales", right: "regions" }, known)).toEqual(["sales", "regions"]);
    expect(parentsFromInput({ names: ["sales", "nope"] }, known)).toEqual(["sales"]);
    expect(parentsFromInput({ name: "unknown" }, known)).toEqual([]);
  });

  it("prefers the structured artifacts key when present", () => {
    const step: SessionStep = {
      kind: "tool_result",
      time: 1,
      data: {
        step: 3,
        tool: "pivot_dataset",
        result: "some text without any recognisable pattern",
        artifacts: {
          datasets: [{ name: "sales_pivot", rows: 3, cols: 4, parents: ["sales"], tool: "pivot_dataset" }],
          files: [{ path: "plots/sales__pivot.png", kind: "chart", dataset: "sales" }],
        },
      },
    };
    const known = new Set<string>();
    const a = artifactsFromStep(step, known);
    expect(a.datasets[0]).toMatchObject({ name: "sales_pivot", parents: ["sales"], rows: 3, cols: 4 });
    expect(a.charts[0]).toMatchObject({ path: "plots/sales__pivot.png", dataset: "sales" });
    expect(known.has("sales_pivot")).toBe(true);
  });

  it("merges without duplicates and updates shapes", () => {
    const base = { datasets: [{ name: "s", rows: 0, cols: 0, parents: [], tool: "load_csv", step: 1 }], charts: [], reports: [], files: [] };
    const add = { datasets: [{ name: "s", rows: 10, cols: 2, parents: [], tool: "load_csv", step: 2 }], charts: [], reports: [], files: [] };
    const m = mergeArtifacts(base, add);
    expect(m.datasets).toHaveLength(1);
    expect(m.datasets[0].rows).toBe(10);
  });
});

describe("agent charts with a Vega-Lite twin", () => {
  const line = "Histogram of 'qty' saved to plots/sales__qty_distribution.png (Vega-Lite spec: plots/sales__qty_distribution.vl.json)\n  120 values, 0 blank.";

  it("classifies the spec file", () => {
    expect(fileKind("plots/sales__qty_distribution.vl.json")).toBe("spec");
    expect(specPathFor("plots/sales__qty_distribution.png")).toBe("plots/sales__qty_distribution.vl.json");
  });

  it("reads the spec path out of the result text", () => {
    expect(parseResultText(line).files).toEqual(["plots/sales__qty_distribution.png", "plots/sales__qty_distribution.vl.json"]);
  });

  it("structured: a chart entry with `spec` becomes one agent chart, not a png plus a file", () => {
    const step: SessionStep = {
      kind: "tool_result",
      time: 1,
      data: {
        step: 4,
        tool: "plot_column",
        input: { name: "sales", column: "qty" },
        result: line,
        artifacts: {
          datasets: [],
          files: [{ path: "plots/sales__qty_distribution.png", kind: "chart", dataset: "sales", spec: "plots/sales__qty_distribution.vl.json" }],
        },
      },
    };
    const a = artifactsFromStep(step, new Set(["sales"]));
    expect(a.charts).toEqual([
      { id: "plots/sales__qty_distribution.png", kind: "agent", path: "plots/sales__qty_distribution.png", specPath: "plots/sales__qty_distribution.vl.json", dataset: "sales", tool: "plot_column", step: 4, input: { name: "sales", column: "qty" } },
    ]);
    expect(a.files).toEqual([]);
  });

  it("structured: a chart entry without `spec` stays a png chart (older backend)", () => {
    const step: SessionStep = {
      kind: "tool_result",
      time: 1,
      data: { step: 4, tool: "plot_column", result: "x", artifacts: { datasets: [], files: [{ path: "plots/a.png", kind: "chart", dataset: "sales" }] } },
    };
    expect(artifactsFromStep(step, new Set()).charts[0]).toMatchObject({ kind: "png", path: "plots/a.png" });
  });

  it("fallback: the spec named in the text rides on its chart", () => {
    const step: SessionStep = { kind: "tool_result", time: 1, data: { step: 4, tool: "plot_column", input: { name: "sales", column: "qty" }, result: line } };
    const a = artifactsFromStep(step, new Set(["sales"]));
    expect(a.charts).toHaveLength(1);
    expect(a.charts[0]).toMatchObject({ kind: "agent", path: "plots/sales__qty_distribution.png", specPath: "plots/sales__qty_distribution.vl.json", dataset: "sales" });
    expect(a.files).toEqual([]);
  });

  it("fallback: a spec without its png in the same result is kept as a file", () => {
    const step: SessionStep = { kind: "tool_result", time: 1, data: { step: 4, tool: "x", result: "Spec written (Vega-Lite spec: plots/lone.vl.json)" } };
    const a = artifactsFromStep(step, new Set());
    expect(a.charts).toEqual([]);
    expect(a.files).toEqual([{ path: "plots/lone.vl.json", kind: "spec", step: 4, tool: "x" }]);
  });
});

describe("eval runs (agent evaluate_llm / get_eval_run results)", () => {
  const tail = (id: string, gates: string) =>
    `Run ${id} — complete\n  perfect: 40 samples\n\nJSON:\n{"job_id": "abc", "status": "complete", "run_id": "${id}", "gates_passed": ${gates}}`;

  it("reads the structured eval_runs key when the backend sends it", () => {
    const step = {
      kind: "tool_result",
      time: 1,
      data: {
        step: 4,
        tool: "evaluate_llm",
        result: "irrelevant text",
        artifacts: { datasets: [], files: [], eval_runs: [{ run_id: "20261005-123818-69307f", gates_passed: true, status: "complete", tool: "evaluate_llm" }] },
      },
    } as unknown as SessionStep;
    const a = artifactsFromStep(step, new Set());
    expect(a.evalRuns).toEqual([{ runId: "20261005-123818-69307f", gatesPassed: true, status: "complete", tool: "evaluate_llm", step: 4 }]);
    expect(a.datasets).toEqual([]);
  });

  it("falls back to the JSON tail of the result text", () => {
    const step = { kind: "tool_result", time: 1, data: { step: 2, tool: "get_eval_run", result: tail("20261003-184759-094e1e", "false") } } as unknown as SessionStep;
    const a = artifactsFromStep(step, new Set());
    expect(a.evalRuns).toEqual([{ runId: "20261003-184759-094e1e", gatesPassed: false, status: "complete", tool: "get_eval_run", step: 2 }]);
    expect(a.files).toEqual([]);
  });

  it("ignores the same ids in results of other tools", () => {
    const step = { kind: "tool_result", time: 1, data: { step: 2, tool: "read_file", result: tail("20261003-184759-094e1e", "true") } } as unknown as SessionStep;
    expect(artifactsFromStep(step, new Set()).evalRuns ?? []).toEqual([]);
  });

  it("merges one card per run, keeping the newest verdict", () => {
    const base = { datasets: [], charts: [], reports: [], files: [] };
    const first = mergeArtifacts(base, { ...base, evalRuns: [{ runId: "r1", gatesPassed: null, status: "running", tool: "evaluate_llm", step: 1 }] });
    const second = mergeArtifacts(first, { ...base, evalRuns: [{ runId: "r1", gatesPassed: true, status: "complete", tool: "check_eval_job", step: 3 }] });
    expect(second.evalRuns).toEqual([{ runId: "r1", gatesPassed: true, status: "complete", tool: "evaluate_llm", step: 1 }]);
  });
});
