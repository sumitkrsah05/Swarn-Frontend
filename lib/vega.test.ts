import { describe, expect, it } from "vitest";
import type { DatasetColumn } from "./api";
import { configFromSpec } from "./vega";

const columns: DatasetColumn[] = [
  { name: "region", dtype: "object", kind: "string" },
  { name: "revenue", dtype: "float64", kind: "number" },
  { name: "qty", dtype: "float64", kind: "number" },
  { name: "signup", dtype: "datetime64[ns]", kind: "datetime" },
] as DatasetColumn[];

const spec = (tool: string, cols: string[]) => ({ mark: "bar", usermeta: { swarn: { tool, columns: cols } } });

describe("configFromSpec (Edit chart on an agent chart)", () => {
  it("maps plot_column by the column's kind", () => {
    expect(configFromSpec(spec("plot_column", ["revenue"]), columns)).toMatchObject({ type: "histogram", encodings: { x: { field: "revenue" } } });
    expect(configFromSpec(spec("plot_column", ["region"]), columns)).toMatchObject({ type: "bar", encodings: { x: { field: "region" }, y: { aggregate: "count" } } });
    expect(configFromSpec(spec("plot_column", ["signup"]), columns)).toMatchObject({ type: "line", encodings: { x: { field: "signup", type: "temporal" } } });
  });

  it("maps plot_relationship to scatter, boxplot, line or heatmap", () => {
    expect(configFromSpec(spec("plot_relationship", ["qty", "revenue"]), columns)?.type).toBe("scatter");
    expect(configFromSpec(spec("plot_relationship", ["region", "revenue"]), columns)?.type).toBe("boxplot");
    expect(configFromSpec(spec("plot_relationship", ["signup", "revenue"]), columns)?.type).toBe("line");
  });

  it("maps analyze_over_time with and without a value column", () => {
    expect(configFromSpec(spec("analyze_over_time", ["signup", "revenue"]), columns)).toMatchObject({ type: "line", encodings: { y: { field: "revenue", aggregate: "sum" } } });
    expect(configFromSpec(spec("analyze_over_time", ["signup"]), columns)).toMatchObject({ type: "line", encodings: { y: { aggregate: "count" } } });
  });

  it("returns null for shapes the editor cannot express, or columns it cannot see", () => {
    expect(configFromSpec(spec("analyze_missing", ["revenue"]), columns)).toBeNull();
    expect(configFromSpec(spec("analyze_correlations", ["qty", "revenue"]), columns)).toBeNull();
    expect(configFromSpec(spec("plot_column", ["gone"]), columns)).toBeNull();
    expect(configFromSpec({ mark: "bar" }, columns)).toBeNull();
    expect(configFromSpec(undefined, columns)).toBeNull();
  });
});
