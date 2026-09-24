/**
 * Client-side Vega-Lite charts (docs/guide.md §7.7): the gallery, auto
 * encoding from column kinds, and the spec builder behind Quick chart and
 * Edit chart. No model call is ever involved. Pure and unit-testable.
 */

import type { ColumnKind, DatasetColumn } from "./api";

export type VegaChartType =
  | "scatter"
  | "bar"
  | "grouped-bar"
  | "stacked-bar"
  | "histogram"
  | "boxplot"
  | "line"
  | "area"
  | "heatmap";

export type Channel = "x" | "y" | "color" | "size" | "column" | "row";
export const CHANNELS: Channel[] = ["x", "y", "color", "size", "column", "row"];

export type FieldType = "auto" | "quantitative" | "nominal" | "temporal" | "ordinal";
export type Aggregate = "none" | "count" | "sum" | "mean";
export type SortOrder = "none" | "ascending" | "descending";

export interface Encoding {
  field?: string;
  type?: FieldType;
  aggregate?: Aggregate;
  sort?: SortOrder;
}

export interface ChartConfig {
  type: VegaChartType;
  encodings: Partial<Record<Channel, Encoding>>;
}

export const CHART_GALLERY: { category: string; items: { type: VegaChartType; name: string }[] }[] = [
  { category: "Points", items: [{ type: "scatter", name: "Scatter" }] },
  {
    category: "Bars",
    items: [
      { type: "bar", name: "Bar" },
      { type: "grouped-bar", name: "Grouped bar" },
      { type: "stacked-bar", name: "Stacked bar" },
    ],
  },
  {
    category: "Distributions",
    items: [
      { type: "histogram", name: "Histogram" },
      { type: "boxplot", name: "Box plot" },
    ],
  },
  {
    category: "Lines & Areas",
    items: [
      { type: "line", name: "Line" },
      { type: "area", name: "Area" },
    ],
  },
  { category: "Grid", items: [{ type: "heatmap", name: "Heatmap" }] },
];

export function chartName(type: VegaChartType): string {
  for (const g of CHART_GALLERY) for (const it of g.items) if (it.type === type) return it.name;
  return type;
}

/** Channels a chart type can use, in the order the popover shows them. */
export function channelsFor(type: VegaChartType): Channel[] {
  switch (type) {
    case "scatter":
      return ["x", "y", "color", "size", "column", "row"];
    case "histogram":
      return ["x", "color", "column", "row"];
    case "heatmap":
      return ["x", "y", "color"];
    case "boxplot":
      return ["x", "y", "color"];
    default:
      return ["x", "y", "color", "column", "row"];
  }
}

export function vlType(kind: ColumnKind | undefined): "quantitative" | "nominal" | "temporal" {
  if (kind === "number") return "quantitative";
  if (kind === "date" || kind === "datetime") return "temporal";
  return "nominal";
}

/** Fill channels from the column kinds (§7.7 auto-encoding). */
export function autoEncode(type: VegaChartType, columns: DatasetColumn[], distinct?: Record<string, number>): ChartConfig {
  const numeric = columns.filter((c) => c.kind === "number");
  const strings = columns.filter((c) => c.kind === "string" || c.kind === "boolean");
  const dates = columns.filter((c) => c.kind === "date" || c.kind === "datetime");
  const enc: ChartConfig["encodings"] = {};
  const lowCard = (name: string) => distinct == null || (distinct[name] ?? 0) <= 20;
  const firstString = strings[0];
  const secondString = strings.find((c) => c !== firstString && lowCard(c.name));
  const firstNumeric = numeric[0];
  const secondNumeric = numeric[1];
  switch (type) {
    case "line":
    case "area":
      if (dates[0]) enc.x = { field: dates[0].name, type: "temporal" };
      else if (firstString) enc.x = { field: firstString.name, type: "nominal" };
      if (firstNumeric) enc.y = { field: firstNumeric.name, type: "quantitative", aggregate: dates[0] ? "sum" : "none" };
      if (secondString) enc.color = { field: secondString.name, type: "nominal" };
      break;
    case "scatter":
      if (firstNumeric) enc.x = { field: firstNumeric.name, type: "quantitative" };
      if (secondNumeric) enc.y = { field: secondNumeric.name, type: "quantitative" };
      else if (firstString) enc.y = { field: firstString.name, type: "nominal" };
      if (firstString && lowCard(firstString.name)) enc.color = { field: firstString.name, type: "nominal" };
      break;
    case "histogram":
      if (firstNumeric) enc.x = { field: firstNumeric.name, type: "quantitative" };
      break;
    case "boxplot":
      if (firstString) enc.x = { field: firstString.name, type: "nominal" };
      if (firstNumeric) enc.y = { field: firstNumeric.name, type: "quantitative" };
      break;
    case "heatmap":
      if (firstString) enc.x = { field: firstString.name, type: "nominal" };
      if (secondString) enc.y = { field: secondString.name, type: "nominal" };
      else if (strings[1]) enc.y = { field: strings[1].name, type: "nominal" };
      if (firstNumeric) enc.color = { field: firstNumeric.name, type: "quantitative", aggregate: "mean" };
      else enc.color = { aggregate: "count" };
      break;
    default: // bars
      if (firstString) enc.x = { field: firstString.name, type: "nominal" };
      else if (dates[0]) enc.x = { field: dates[0].name, type: "temporal" };
      if (firstNumeric) enc.y = { field: firstNumeric.name, type: "quantitative", aggregate: "sum" };
      else enc.y = { aggregate: "count" };
      if (secondString && (type === "grouped-bar" || type === "stacked-bar")) enc.color = { field: secondString.name, type: "nominal" };
      else if (secondString) enc.color = { field: secondString.name, type: "nominal" };
  }
  return { type, encodings: enc };
}

/** "Edit chart" on an agent PNG: prefill from the tool input (x, y, column). */
export function configFromToolInput(tool: string, input: Record<string, unknown> | undefined, columns: DatasetColumn[]): ChartConfig {
  const kind = (name: string) => columns.find((c) => c.name === name)?.kind;
  const str = (k: string) => (typeof input?.[k] === "string" ? (input[k] as string) : undefined);
  const x = str("x");
  const y = str("y");
  const column = str("column");
  if (tool === "plot_column" && column) {
    const k = kind(column);
    if (k === "number") return { type: "histogram", encodings: { x: { field: column, type: "quantitative" } } };
    if (k === "date" || k === "datetime")
      return { type: "line", encodings: { x: { field: column, type: "temporal" }, y: { aggregate: "count" } } };
    return { type: "bar", encodings: { x: { field: column, type: "nominal" }, y: { aggregate: "count" } } };
  }
  if (x && y) {
    const kx = kind(x);
    const ky = kind(y);
    if (kx === "number" && ky === "number") return { type: "scatter", encodings: { x: { field: x, type: "quantitative" }, y: { field: y, type: "quantitative" } } };
    if (kx === "date" || kx === "datetime") return { type: "line", encodings: { x: { field: x, type: "temporal" }, y: { field: y, type: vlType(ky), aggregate: ky === "number" ? "mean" : "count" } } };
    if (ky === "number") return { type: "boxplot", encodings: { x: { field: x, type: "nominal" }, y: { field: y, type: "quantitative" } } };
    return { type: "heatmap", encodings: { x: { field: x, type: "nominal" }, y: { field: y, type: "nominal" }, color: { aggregate: "count" } } };
  }
  if (tool === "analyze_over_time") {
    const date = str("date_col");
    const value = str("value_col");
    return { type: "line", encodings: { x: date ? { field: date, type: "temporal" } : {}, y: value ? { field: value, type: "quantitative", aggregate: "sum" } : { aggregate: "count" } } };
  }
  return autoEncode("bar", columns);
}

type VlEncoding = Record<string, unknown>;

function encodeChannel(ch: Channel, e: Encoding | undefined, columns: DatasetColumn[], type: VegaChartType): VlEncoding | null {
  if (!e) return null;
  if (!e.field && (!e.aggregate || e.aggregate === "none")) return null;
  const col = e.field ? columns.find((c) => c.name === e.field) : undefined;
  const resolvedType = !e.type || e.type === "auto" ? vlType(col?.kind) : e.type;
  const out: VlEncoding = {};
  if (e.field) out.field = e.field;
  if (e.aggregate && e.aggregate !== "none") {
    out.aggregate = e.aggregate;
    out.type = "quantitative";
    if (e.aggregate === "count") delete out.field;
  } else {
    out.type = resolvedType;
  }
  if (type === "histogram" && ch === "x" && resolvedType === "quantitative") out.bin = true;
  if (e.sort && e.sort !== "none") out.sort = e.sort === "ascending" ? "ascending" : "descending";
  if (ch === "color" && out.type === "nominal") out.legend = { orient: "bottom" };
  if ((ch === "x" || ch === "y") && out.type === "nominal") out.axis = { labelAngle: ch === "x" ? -30 : 0, labelLimit: 120 };
  return out;
}

/** Build a Vega-Lite spec. Data is bound by name ("table") unless values are given. */
export function buildSpec(config: ChartConfig, columns: DatasetColumn[], values?: Record<string, unknown>[] | null, title?: string): Record<string, unknown> {
  const enc: Record<string, VlEncoding> = {};
  for (const ch of channelsFor(config.type)) {
    const e = encodeChannel(ch, config.encodings[ch], columns, config.type);
    if (e) enc[ch] = e;
  }
  let mark: unknown;
  switch (config.type) {
    case "scatter":
      mark = { type: "point", filled: true, opacity: 0.75 };
      break;
    case "line":
      mark = { type: "line", point: true };
      break;
    case "area":
      mark = { type: "area", opacity: 0.8 };
      break;
    case "boxplot":
      mark = { type: "boxplot", extent: "min-max" };
      break;
    case "heatmap":
      mark = { type: "rect" };
      break;
    case "histogram":
      mark = { type: "bar" };
      if (!enc.y) enc.y = { aggregate: "count", type: "quantitative", title: "rows" };
      break;
    default:
      mark = { type: "bar" };
  }
  if (config.type === "grouped-bar" && enc.color) {
    enc.xOffset = { field: (enc.color as { field?: string }).field, type: "nominal" };
  }
  if (config.type === "bar" && enc.color && enc.y) {
    // a plain bar with a colour splits into a stack; keep it side-by-side visually by offset
    enc.xOffset = { field: (enc.color as { field?: string }).field, type: "nominal" };
  }
  const spec: Record<string, unknown> = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    title: title ? { text: title, anchor: "start", fontSize: 13, fontWeight: 500 } : undefined,
    data: values ? { values } : { name: "table" },
    mark,
    encoding: enc,
    width: "container",
    height: "container",
    config: {
      background: "transparent",
      view: { stroke: null },
      axis: { labelFontSize: 11, titleFontSize: 11, gridColor: "rgba(127,127,127,0.18)", domainColor: "rgba(127,127,127,0.4)", tickColor: "rgba(127,127,127,0.4)" },
      legend: { labelFontSize: 11, titleFontSize: 11 },
      font: "inherit",
      range: { category: ["#0f6cbd", "#c85a17", "#7a5bb5", "#0f9d58", "#b7791f", "#dc2626", "#4aa3f0", "#f08a4b"] },
    },
  };
  if (!title) delete spec.title;
  return spec;
}

/** Fields used by a config (for "what's on the chart" chips). */
export function fieldsOf(config: ChartConfig): string[] {
  const out: string[] = [];
  for (const ch of CHANNELS) {
    const f = config.encodings[ch]?.field;
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

/** Open the Vega Editor in a new tab and hand it the spec via postMessage. */
export function openInVegaEditor(spec: Record<string, unknown>): void {
  const editor = window.open("https://vega.github.io/editor/", "_blank");
  if (!editor) return;
  const payload = { mode: "vega-lite", spec: JSON.stringify({ ...spec, width: 500, height: 300, data: spec.data }), renderer: "canvas" };
  let tries = 0;
  const send = () => {
    tries += 1;
    try {
      editor.postMessage(payload, "https://vega.github.io");
    } catch {
      /* not ready yet */
    }
    if (tries < 8) setTimeout(send, 500);
  };
  setTimeout(send, 800);
}

/** Row objects for Vega from the /rows response shape (column names or descriptors). */
export function rowsToObjects(columns: (string | { name: string })[], rows: unknown[][]): Record<string, unknown>[] {
  const names = columns.map((c) => (typeof c === "string" ? c : c.name));
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    names.forEach((c, i) => {
      o[c] = r[i];
    });
    return o;
  });
}
