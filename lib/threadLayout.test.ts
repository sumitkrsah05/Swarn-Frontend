import { describe, expect, it } from "vitest";
import { columnsForWidth, defaultColumns, layoutThreads, maxColumnsFor, packSegments, paneWidthFor, snapPaneWidth } from "./threadLayout";
import { emptyArtifacts, makeWorkspace, type Turn, type Workspace } from "./workspace";

function turn(id: string, parentId: string | null, at: number): Turn {
  return { id, parentId, prompt: id, jobId: null, sessionId: null, status: "complete", steps: [], artifacts: emptyArtifacts(), startedAt: at };
}

function ws(turns: Turn[]): Workspace {
  const w = makeWorkspace("w");
  w.turns = turns;
  return w;
}

const ten = () => 10;

describe("layoutThreads", () => {
  it("lays a linear chain out as one column", () => {
    const l = layoutThreads(ws([turn("a", null, 1), turn("b", "a", 2), turn("c", "b", 3)]), 100, ten);
    expect(l.columns).toHaveLength(1);
    expect(l.columns[0].rows.map((r) => r.kind)).toEqual(["turn", "turn", "turn"]);
    expect(l.columns[0].threadNo).toBe(1);
  });

  it("forks a second child into a new column that starts with a reference chip", () => {
    const l = layoutThreads(ws([turn("a", null, 1), turn("b", "a", 2), turn("c", "a", 3)]), 100, ten);
    expect(l.columns).toHaveLength(2);
    expect(l.columns[0].turnIds).toEqual(["a", "b"]);
    expect(l.columns[1].rows[0]).toEqual({ kind: "reference", turnId: "a", skipped: 0 });
    expect(l.columns[1].turnIds).toEqual(["c"]);
    expect(l.columns[1].threadNo).toBe(2);
  });

  it("counts the skipped ancestors for the '…' row", () => {
    // a → b → c → d, with e forked from c: the chip refers to c and skips a, b
    const l = layoutThreads(ws([turn("a", null, 1), turn("b", "a", 2), turn("c", "b", 3), turn("d", "c", 4), turn("e", "c", 5)]), 100, ten);
    expect(l.columns[1].rows[0]).toEqual({ kind: "reference", turnId: "c", skipped: 2 });
  });

  it("does not repeat history in a fork column", () => {
    const l = layoutThreads(ws([turn("a", null, 1), turn("b", "a", 2), turn("c", "b", 3), turn("d", "b", 4)]), 100, ten);
    expect(l.columns[1].turnIds).toEqual(["d"]);
    expect(l.columnOf.get("d")).toBe(1);
    expect(l.columnOf.get("c")).toBe(0);
  });

  it("splits a long chain into CONTINUES / CONTINUED segments packed evenly", () => {
    const chain: Turn[] = [];
    for (let i = 0; i < 8; i++) chain.push(turn(`t${i}`, i ? `t${i - 1}` : null, i + 1));
    const l = layoutThreads(ws(chain), 26, ten);
    expect(l.columns.length).toBe(4);
    expect(l.columns.every((c) => c.threadNo === 1)).toBe(true);
    expect(l.columns[0].rows[l.columns[0].rows.length - 1]).toEqual({ kind: "continues" });
    expect(l.columns[1].rows[0]).toEqual({ kind: "continued", turnId: "t1" });
    expect(l.columns[3].rows.some((r) => r.kind === "continues")).toBe(false);
    // evenly packed: the tallest column is as short as possible
    expect(Math.max(...l.columns.map((c) => c.units))).toBeLessThanOrEqual(26);
    expect(l.columns.map((c) => c.turnIds.length)).toEqual([2, 2, 2, 2]);
  });
});

describe("packSegments", () => {
  it("keeps a short chain whole", () => {
    expect(packSegments([5, 5, 5], 26)).toEqual([[0, 1, 2]]);
  });
  it("never splits a single turn", () => {
    expect(packSegments([80], 26)).toEqual([[0]]);
  });
  it("balances segments", () => {
    expect(packSegments([10, 10, 10, 10, 10, 10], 26, 0)).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
});

describe("column geometry", () => {
  it("computes the pane width for n columns", () => {
    expect(paneWidthFor(1)).toBe(280);
    expect(paneWidthFor(2)).toBe(536);
    expect(paneWidthFor(3)).toBe(792);
    expect(columnsForWidth(536)).toBe(2);
    expect(columnsForWidth(700)).toBe(3);
  });
  it("snaps to whole columns and never starves the canvas", () => {
    expect(snapPaneWidth(600, 1440)).toBe(536);
    expect(maxColumnsFor(1000)).toBe(1);
    expect(snapPaneWidth(900, 1000)).toBe(280);
  });
  it("defaults by viewport width", () => {
    expect(defaultColumns(1280)).toBe(2);
    expect(defaultColumns(1700)).toBe(3);
    expect(defaultColumns(2600)).toBe(4);
    expect(defaultColumns(800)).toBe(1);
  });
});
