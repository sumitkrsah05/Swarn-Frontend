/**
 * Thread column layout (docs/guide.md §2.3).
 *
 * A workspace's turn tree is laid out as vertical columns of 248px cards:
 *  - a root and its first children form THREAD 1; every other child forks a
 *    new column that starts with a reference chip for the parent (and a "…"
 *    row when more than one ancestor was skipped)
 *  - a long chain splits across columns: a segment ends with "⌄ CONTINUES"
 *    and the next starts with "⌃ CONTINUED" plus a chip; segments are packed
 *    so the tallest column is as short as possible
 *
 * Pure and unit-tested (lib/threadLayout.test.ts).
 */

import { ancestors, childrenOf, roots, type Turn, type Workspace } from "./workspace";

export type LayoutRow =
  | { kind: "reference"; turnId: string; skipped: number }
  | { kind: "continued"; turnId: string }
  | { kind: "turn"; turnId: string }
  | { kind: "continues" };

export interface LayoutColumn {
  id: string;
  /** 1-based thread number shown in the header */
  threadNo: number;
  /** 0-based segment of a split chain */
  segment: number;
  rows: LayoutRow[];
  /** estimated height in layout units */
  units: number;
  /** turn ids in this column, in order */
  turnIds: string[];
}

export interface ThreadLayout {
  columns: LayoutColumn[];
  /** turnId → column index */
  columnOf: Map<string, number>;
}

/** Height estimate for one turn, in units (~28px each). */
export function estimateUnits(t: Turn): number {
  let u = 3; // prompt card
  u += 1; // plan line / thinking banner
  if (t.status === "queued" || t.status === "running") u += Math.min(6, 2 + t.steps.length / 4);
  u += t.artifacts.datasets.length * 2;
  u += t.artifacts.datasets.filter((d) => d.parents.length > 1).length; // merge rows
  u += t.artifacts.charts.length * 4;
  u += t.artifacts.reports.length * 2;
  if (t.answer || t.failure) u += 2;
  if (t.question) u += 2;
  return u;
}

const REF_UNITS = 1.5;

function chainsOf(ws: Workspace): { turns: Turn[]; forkFrom: Turn | null }[] {
  const byStart = (a: Turn, b: Turn) => a.startedAt - b.startedAt;
  const queue: { start: Turn; forkFrom: Turn | null }[] = roots(ws)
    .sort(byStart)
    .map((r) => ({ start: r, forkFrom: null }));
  const out: { turns: Turn[]; forkFrom: Turn | null }[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const { start, forkFrom } = queue.shift() as { start: Turn; forkFrom: Turn | null };
    if (seen.has(start.id)) continue;
    const chain: Turn[] = [];
    let cur: Turn | undefined = start;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push(cur);
      const kids: Turn[] = childrenOf(ws, cur.id).sort(byStart);
      for (let i = 1; i < kids.length; i++) queue.push({ start: kids[i], forkFrom: cur });
      cur = kids[0];
    }
    out.push({ turns: chain, forkFrom });
  }
  return out;
}

/** Split a chain into segments whose unit height stays under `maxUnits`, evenly. */
export function packSegments(units: number[], maxUnits: number, extra = REF_UNITS): number[][] {
  if (units.length === 0) return [];
  const total = units.reduce((a, b) => a + b, 0);
  if (total <= maxUnits || units.length === 1) return [units.map((_, i) => i)];
  const segments = Math.max(1, Math.ceil(total / Math.max(1, maxUnits - extra)));
  const target = Math.ceil(total / segments) + extra;
  const out: number[][] = [];
  let cur: number[] = [];
  let acc = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (cur.length > 0 && acc + u > target && out.length < segments - 1) {
      out.push(cur);
      cur = [];
      acc = 0;
    }
    cur.push(i);
    acc += u;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function layoutThreads(ws: Workspace, maxUnits = 26, heightOf: (t: Turn) => number = estimateUnits): ThreadLayout {
  const columns: LayoutColumn[] = [];
  const columnOf = new Map<string, number>();
  const chains = chainsOf(ws);
  chains.forEach((chain, ci) => {
    const threadNo = ci + 1;
    const units = chain.turns.map(heightOf);
    const segs = packSegments(units, maxUnits, chain.forkFrom ? REF_UNITS : 0);
    segs.forEach((idxs, si) => {
      const rows: LayoutRow[] = [];
      let u = 0;
      if (si === 0 && chain.forkFrom) {
        rows.push({ kind: "reference", turnId: chain.forkFrom.id, skipped: ancestors(ws, chain.forkFrom.id).length });
        u += REF_UNITS;
      }
      if (si > 0) {
        const prev = chain.turns[segs[si - 1][segs[si - 1].length - 1]];
        rows.push({ kind: "continued", turnId: prev.id });
        u += REF_UNITS;
      }
      const turnIds: string[] = [];
      for (const i of idxs) {
        const t = chain.turns[i];
        rows.push({ kind: "turn", turnId: t.id });
        turnIds.push(t.id);
        columnOf.set(t.id, columns.length);
        u += units[i];
      }
      if (si < segs.length - 1) {
        rows.push({ kind: "continues" });
        u += 1;
      }
      columns.push({ id: `${threadNo}-${si}`, threadNo, segment: si, rows, units: u, turnIds });
    });
  });
  return { columns, columnOf };
}

/** Thread-pane width for n columns (§2.2). */
export const COLUMN_W = 248;
export const COLUMN_GAP = 8;
export const PANE_PADDING = 32;

export function paneWidthFor(n: number): number {
  return n * COLUMN_W + (n - 1) * COLUMN_GAP + PANE_PADDING;
}

export function columnsForWidth(px: number): number {
  return Math.max(1, Math.round((px - PANE_PADDING + COLUMN_GAP) / (COLUMN_W + COLUMN_GAP)));
}

/** Default column count by viewport width (§2.2 table). */
export function defaultColumns(viewportWidth: number): number {
  if (viewportWidth < 1280) return viewportWidth < 1000 ? 1 : 2;
  if (viewportWidth < 1680) return 2;
  if (viewportWidth < 2560) return 3;
  return viewportWidth < 3400 ? 4 : 5;
}

/** Largest column count that still leaves the canvas ≥ minCanvas px. */
export function maxColumnsFor(totalWidth: number, minCanvas = 500, separator = 6): number {
  const avail = totalWidth - minCanvas - separator;
  return Math.max(1, Math.floor((avail - PANE_PADDING + COLUMN_GAP) / (COLUMN_W + COLUMN_GAP)));
}

/** Snap a dragged thread-pane width to whole columns, respecting the canvas minimum. */
export function snapPaneWidth(px: number, total: number, minCanvas = 500): number {
  const n = Math.min(columnsForWidth(px), maxColumnsFor(total, minCanvas));
  return paneWidthFor(Math.max(1, n));
}
