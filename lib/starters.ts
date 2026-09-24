/**
 * Starter questions for a focused SOURCE dataset (docs/guide.md §7.5):
 * generated client-side and deterministically from the column kinds — no
 * model call. `GET /api/data/datasets` gives the kinds; it does not give
 * cardinalities, so the "low-cardinality string" is chosen by name (category,
 * region, status, …) and otherwise falls back to the first string column.
 */

import type { DatasetInfo } from "./api";

const TARGET_RE = /price|revenue|sales|churn|rating|score|target|amount|income|profit|cost|salary|total|value|conversion|retention|label|outcome/i;
const CATEGORY_RE = /category|type|region|segment|status|group|class|gender|sex|country|state|city|department|plan|tier|product|channel|brand|kind|level/i;
const ID_RE = /(^|_)(id|uuid|key|index)$/i;

export function starterQuestions(ds: Pick<DatasetInfo, "columns">): string[] {
  const numeric = ds.columns.filter((c) => c.kind === "number" && !ID_RE.test(c.name));
  const strings = ds.columns.filter((c) => c.kind === "string" && !ID_RE.test(c.name));
  const dates = ds.columns.filter((c) => c.kind === "date" || c.kind === "datetime");
  const out: string[] = [];
  const push = (q: string) => {
    if (!out.includes(q)) out.push(q);
  };
  const first = numeric[0];
  if (first) push(`Show the distribution of ${first.name}`);
  const target = numeric.find((c) => TARGET_RE.test(c.name)) ?? numeric[numeric.length - 1];
  if (target) push(`What drives ${target.name}?`);
  const cat = strings.find((c) => CATEGORY_RE.test(c.name)) ?? strings[0];
  const measure = numeric.find((c) => c !== target) ?? target;
  if (measure && cat) push(`Compare ${measure.name} across ${cat.name}`);
  if (dates[0] && (measure ?? first)) push(`How does ${(measure ?? first)!.name} change over ${dates[0].name}?`);
  push("Clean this dataset");
  return out.slice(0, 5);
}

/** The Tab-on-empty fill (§2.5). */
export const TAB_FILL = "Explore interesting patterns and trends in this data";

/** Landing "Try asking" examples (§7.1). */
export const TRY_ASKING = [
  "Analyse this dataset and write a report",
  "What drives churn?",
  "Clean this file and show me what changed",
  "Train a model to predict the target column",
];

/** Landing example cards (§7.1) — they prefill the composer, no demo data. */
export const EXAMPLES: { title: string; prompt: string; hint: string }[] = [
  {
    title: "Explore a spreadsheet",
    prompt: "Load every sheet of the workbook, validate the data and tell me what stands out.",
    hint: "attach an .xlsx and let the agent inspect every sheet first",
  },
  {
    title: "Find what drives a number",
    prompt: "What drives revenue in this dataset? Check the relationship inside each region before you conclude.",
    hint: "correlations with subgroup checks",
  },
  {
    title: "Clean, then compare",
    prompt: "Clean this dataset, then compare the key metric across the main categories and show me the chart.",
    hint: "a cleaning plan you approve, then charts",
  },
  {
    title: "Write the report",
    prompt: "Analyse the dataset, plot the two most important relationships and write a report of the findings.",
    hint: "ends with an HTML report you can open",
  },
];
