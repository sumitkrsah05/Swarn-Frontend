import { describe, expect, it } from "vitest";
import {
  deleteChart,
  deleteSubtree,
  emptyArtifacts,
  makeWorkspace,
  markUnread,
  migrateThreadsV1,
  resumeChain,
  sanitizeWorkspaces,
  setFocus,
  subtreeIds,
  threadCount,
  type Turn,
  type Workspace,
} from "./workspace";

function turn(id: string, parentId: string | null, over: Partial<Turn> = {}): Turn {
  return {
    id,
    parentId,
    prompt: `prompt ${id}`,
    jobId: null,
    sessionId: null,
    status: "complete",
    steps: [],
    artifacts: emptyArtifacts(),
    startedAt: Number(id.replace(/\D/g, "")) || 1,
    ...over,
  };
}

/**
 *   a (s1)
 *   ├─ b (s2) ─ d (running)
 *   └─ c (s3)
 */
function tree(): Workspace {
  const ws = makeWorkspace("t");
  ws.turns = [
    turn("a1", null, { sessionId: "s1" }),
    turn("b2", "a1", { sessionId: "s2" }),
    turn("c3", "a1", { sessionId: "s3" }),
    turn("d4", "b2", { status: "running", jobId: "job-d" }),
  ];
  return ws;
}

describe("resumeChain", () => {
  it("sends only the ancestors' completed sessions, oldest first", () => {
    const ws = tree();
    expect(resumeChain(ws, "b2")).toEqual(["s1", "s2"]);
    expect(resumeChain(ws, "a1")).toEqual(["s1"]);
    expect(resumeChain(ws, null)).toEqual([]);
  });

  it("never leaks a sibling branch into the context", () => {
    const ws = tree();
    // a fork from c must not see b's session, and vice versa
    expect(resumeChain(ws, "c3")).toEqual(["s1", "s3"]);
    expect(resumeChain(ws, "c3")).not.toContain("s2");
    expect(resumeChain(ws, "b2")).not.toContain("s3");
  });

  it("skips turns that have no completed session", () => {
    const ws = tree();
    ws.turns.push(turn("e5", "d4", { status: "failed" }));
    expect(resumeChain(ws, "e5")).toEqual(["s1", "s2"]); // d is still running, e failed
  });
});

describe("deleteSubtree", () => {
  it("removes a turn and everything below it and clears a focus inside it", () => {
    let ws = tree();
    ws = setFocus(ws, { kind: "turn", turnId: "d4" });
    ws = markUnread(ws, { kind: "chart", turnId: "d4", index: 0 });
    expect(subtreeIds(ws, "b2").sort()).toEqual(["b2", "d4"]);
    const next = deleteSubtree(ws, "b2");
    expect(next.turns.map((t) => t.id)).toEqual(["a1", "c3"]);
    expect(next.focus).toBeNull();
    expect(next.unread).toEqual([]);
  });

  it("keeps a focus outside the subtree", () => {
    let ws = tree();
    ws = setFocus(ws, { kind: "answer", turnId: "c3" });
    const next = deleteSubtree(ws, "b2");
    expect(next.focus).toEqual({ kind: "answer", turnId: "c3" });
  });
});

describe("deleteChart", () => {
  it("shifts later chart refs and unread keys down by one", () => {
    let ws = tree();
    ws.turns[0].artifacts.charts = [
      { id: "p1", kind: "png", path: "plots/1.png", tool: "plot_column", step: 1 },
      { id: "p2", kind: "png", path: "plots/2.png", tool: "plot_column", step: 2 },
      { id: "p3", kind: "png", path: "plots/3.png", tool: "plot_column", step: 3 },
    ];
    ws = setFocus(ws, { kind: "chart", turnId: "a1", index: 2 });
    ws = markUnread(ws, { kind: "chart", turnId: "a1", index: 1 });
    const next = deleteChart(ws, "a1", 0);
    expect(next.turns[0].artifacts.charts.map((c) => c.id)).toEqual(["p2", "p3"]);
    expect(next.focus).toEqual({ kind: "chart", turnId: "a1", index: 1 });
    expect(next.unread).toEqual(["chart:a1:0"]);
  });
});

describe("migrateThreadsV1", () => {
  const v1 = {
    threads: [
      {
        id: "t1",
        title: "sales analysis",
        createdAt: 100,
        sessionIds: ["s1", "s2"],
        jobIds: [],
        activeJobId: null,
        status: "complete",
        messages: [
          { id: "m1", role: "user", text: "load sales.csv", ts: 101, attachment: { data_dir: "/x", label: "uploads/1", files: ["sales.csv"] } },
          { id: "m2", role: "assistant", text: "Loaded it.", ts: 110, sessionId: "s1", outcome: "complete" },
          { id: "m3", role: "user", text: "plot revenue", ts: 120 },
          { id: "m4", role: "assistant", text: "Here is the plot.", ts: 130, sessionId: "s2", outcome: "complete" },
          { id: "m5", role: "user", text: "and now this failed", ts: 140, failure: "boom" },
        ],
      },
    ],
    activeId: "t1",
  };

  it("turns each user+assistant pair into one linear turn", () => {
    const [ws] = migrateThreadsV1(v1);
    expect(ws.name).toBe("sales analysis");
    expect(ws.turns).toHaveLength(3);
    const [a, b, c] = ws.turns;
    expect(a.parentId).toBeNull();
    expect(b.parentId).toBe(a.id);
    expect(c.parentId).toBe(b.id);
    expect(a.sessionId).toBe("s1");
    expect(a.answer).toBe("Loaded it.");
    expect(a.attachment?.files).toEqual(["sales.csv"]);
    expect(b.sessionId).toBe("s2");
    expect(c.status).toBe("failed");
    expect(c.failure).toBe("boom");
    // the resume chain of a follow-up to b is exactly the old thread's chain
    expect(resumeChain(ws, b.id)).toEqual(["s1", "s2"]);
  });

  it("ignores garbage", () => {
    expect(migrateThreadsV1(null)).toEqual([]);
    expect(migrateThreadsV1({ threads: [{ id: "x", messages: [] }] })).toEqual([]);
  });
});

describe("sanitizeWorkspaces", () => {
  it("fails an in-flight turn that has no job to poll", () => {
    const [ws] = sanitizeWorkspaces([
      { id: "w", name: "w", createdAt: 1, updatedAt: 1, turns: [{ id: "t", parentId: null, prompt: "p", jobId: null, status: "running", steps: [], artifacts: {} }], focus: null, unread: [] },
    ]);
    expect(ws.turns[0].status).toBe("failed");
    expect(ws.turns[0].failure).toMatch(/Retry/);
  });

  it("re-roots turns whose parent is missing", () => {
    const [ws] = sanitizeWorkspaces([{ id: "w", name: "w", turns: [{ id: "t", parentId: "gone", prompt: "p", status: "complete" }] }]);
    expect(ws.turns[0].parentId).toBeNull();
  });
});

describe("threadCount", () => {
  it("counts roots plus forks", () => {
    expect(threadCount(tree())).toBe(2);
  });
});
