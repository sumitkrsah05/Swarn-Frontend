import { describe, expect, it } from "vitest";
import trace from "../test/fixtures/trace-ab2bb1db.json";
import type { SessionStep } from "./api";
import { artifactsFromStep, artifactsFromSteps, fileKind, mergeArtifacts, normalizePath, parentsFromInput, parseResultText } from "./artifacts";

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
