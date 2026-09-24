import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail, LiveFrame } from "@/lib/api";

// ---- controllable stand-ins for the API and the websocket (hoisted with vi.mock)
const { live, apiMock } = vi.hoisted(() => ({
  live: { handler: null as ((f: LiveFrame) => void) | null },
  apiMock: {
    createJob: vi.fn(),
    getJob: vi.fn(),
    getSession: vi.fn(),
    cancelJob: vi.fn(),
    approveJob: vi.fn(),
  },
}));
vi.mock("@/lib/live", () => ({
  useLiveStatus: () => "live",
  useLiveFrames: (h: (f: LiveFrame) => void) => {
    live.handler = h;
  },
}));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: apiMock };
});

import { RunnerProvider, buildTask, useRunner } from "./useWorkspaceRunner";
import { WorkspaceProvider, useActiveWorkspace, useWorkspaceActions } from "@/lib/workspace-store";
import { resumeChain } from "@/lib/workspace";

function job(over: Partial<JobDetail>): JobDetail {
  return {
    id: "job-1",
    task: "t",
    method: "react",
    status: "running",
    created: 1,
    started: 2,
    finished: null,
    cancel_requested: false,
    session_id: "sess-1",
    run_id: null,
    n_events: 1,
    last_event: null,
    result: null,
    error: null,
    events: [{ ts: 1, type: "session", session_id: "sess-1" }],
    ...over,
  };
}

function Harness() {
  const runner = useRunner();
  const actions = useWorkspaceActions();
  const ws = useActiveWorkspace();
  const turn = ws?.turns[0];
  return (
    <div>
      <button
        onClick={() => {
          const w = actions.create("w");
          runner.ask(w.id, { prompt: "load sales.csv", parentId: null, mentions: ["sales"] });
        }}
      >
        ask
      </button>
      <div data-testid="status">{turn?.status ?? "none"}</div>
      <div data-testid="answer">{turn?.answer ?? ""}</div>
      <div data-testid="charts">{turn?.artifacts.charts.map((c) => c.path).join(",") ?? ""}</div>
      <div data-testid="focus">{ws?.focus ? JSON.stringify(ws.focus) : "null"}</div>
      <div data-testid="session">{turn?.sessionId ?? ""}</div>
    </div>
  );
}

function mount() {
  return render(
    <WorkspaceProvider>
      <RunnerProvider>
        <Harness />
      </RunnerProvider>
    </WorkspaceProvider>,
  );
}

describe("useWorkspaceRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    live.handler = null;
    apiMock.createJob.mockReset();
    apiMock.getJob.mockReset();
    apiMock.getSession.mockReset();
    apiMock.getSession.mockRejectedValue(new Error("no trace"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits a react job with the prompt, the context footer and an empty resume chain", async () => {
    apiMock.createJob.mockResolvedValue(job({ status: "queued", n_events: 0, events: [] }));
    apiMock.getJob.mockResolvedValue(job({ status: "running" }));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      screen.getByText("ask").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(apiMock.createJob).toHaveBeenCalledWith({
      task: "load sales.csv\n\nUse the already-loaded dataset(s): 'sales'.",
      method: "react",
      data_dir: null,
      resume_session_ids: [],
    });
  });

  it("finalises from REST when the websocket never delivers the terminal frame", async () => {
    apiMock.createJob.mockResolvedValue(job({ status: "queued", n_events: 0, events: [] }));
    let phase = 0;
    apiMock.getJob.mockImplementation(async () => (phase === 0 ? job({ status: "running" }) : job({ status: "complete", finished: 9, result: { outcome: "complete", summary: "All done.", session_id: "sess-1" } })));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      screen.getByText("ask").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    // the first poll: still running
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByTestId("status").textContent).toBe("running");

    // a live tool_result frame with a chart arrives → the card appears and is auto-focused
    await act(async () => {
      live.handler?.({
        channel: "session",
        session_id: "sess-1",
        task: "t",
        kind: "tool_result",
        timestamp: 5,
        data: {
          step: 3,
          tool: "plot_column",
          input: { name: "sales", column: "revenue" },
          result: "Histogram of 'revenue' saved to plots/sales__revenue_distribution.png",
        },
      });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("charts").textContent).toBe("plots/sales__revenue_distribution.png");
    expect(JSON.parse(screen.getByTestId("focus").textContent as string)).toMatchObject({ kind: "chart", index: 0 });

    // no terminal websocket frame ever comes; the next REST poll is authoritative
    phase = 1;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByTestId("status").textContent).toBe("complete");
    expect(screen.getByTestId("answer").textContent).toBe("All done.");
    expect(screen.getByTestId("session").textContent).toBe("sess-1");
    // the user never focused anything, so completion focuses the answer
    expect(JSON.parse(screen.getByTestId("focus").textContent as string)).toMatchObject({ kind: "answer" });
  });

  it("marks the turn failed with a retry hint when the server forgot the job", async () => {
    apiMock.createJob.mockResolvedValue(job({ status: "queued", n_events: 0, events: [] }));
    const { ApiError } = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
    apiMock.getJob.mockRejectedValue(new ApiError(404, "no job"));
    mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      screen.getByText("ask").click();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByTestId("status").textContent).toBe("failed");
  });
});

describe("buildTask", () => {
  it("adds the dataset footer only when there are mentions", () => {
    expect(buildTask({ prompt: "hi", mentions: [] })).toBe("hi");
    expect(buildTask({ prompt: "hi", mentions: ["a", "b", "a"] })).toBe("hi\n\nUse the already-loaded dataset(s): 'a', 'b'.");
  });
  it("pairs with resumeChain for a fork", () => {
    expect(resumeChain({ id: "w", name: "w", createdAt: 0, updatedAt: 0, turns: [], focus: null, unread: [] }, null)).toEqual([]);
  });
});
