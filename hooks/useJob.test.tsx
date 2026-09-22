import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDetail, JobFrame } from "@/api/types";

// Controllable stand-in for the shared websocket context.
const live: { status: "connecting" | "live" | "reconnecting"; handler: ((f: unknown) => void) | null } = {
  status: "live",
  handler: null,
};
vi.mock("@/lib/live", () => ({
  useLiveStatus: () => live.status,
  useLiveFrames: (h: (f: unknown) => void) => {
    live.handler = h;
  },
}));

import { useJob } from "./useJob";

function jobDetail(over: Partial<JobDetail> = {}): JobDetail {
  return {
    id: "job-1",
    task: "eval",
    method: "eval",
    status: "running",
    created: 1000,
    started: 1001,
    finished: null,
    cancel_requested: false,
    run_id: "run-1",
    n_events: 1,
    last_event: null,
    pending_approvals: [],
    result: null,
    error: null,
    events: [{ ts: 1001, type: "progress", message: "starting" }],
    events_from: 0,
    ...over,
  };
}

const frame = (message: string): JobFrame => ({
  channel: "job",
  job_id: "job-1",
  method: "eval",
  status: "running",
  task: "eval",
  event: { ts: 1002, type: "progress", message },
});

describe("useJob websocket → polling fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    live.status = "live";
    live.handler = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the websocket while live: frames arrive instantly and no fast polling happens", async () => {
    const fetchJob = vi.fn(async () => jobDetail());
    const { result } = renderHook(() => useJob("job-1", { fetchJob }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchJob).toHaveBeenCalledTimes(1); // initial authoritative load
    expect(result.current.source).toBe("websocket");
    expect(result.current.events.map((e) => e.message)).toEqual(["starting"]);

    // three poll periods elapse: no REST calls while the socket is live
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(fetchJob).toHaveBeenCalledTimes(1);

    // a frame lands immediately in the event list
    act(() => {
      live.handler?.(frame("step 1"));
    });
    expect(result.current.events.map((e) => e.message)).toEqual(["starting", "step 1"]);
  });

  it("falls back to polling every 1.5 s when the socket drops, without losing events", async () => {
    let n = 1;
    const fetchJob = vi.fn(async (_id: string, since: number) => {
      const events = since === 0 ? [{ ts: 1001, type: "progress", message: "starting" }] : [];
      for (let i = since || 1; i < n; i++) events.push({ ts: 1001 + i, type: "progress", message: `poll ${i}` });
      return jobDetail({ n_events: n, events, events_from: since });
    });
    const { result, rerender } = renderHook(() => useJob("job-1", { fetchJob }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchJob).toHaveBeenCalledTimes(1);

    // socket drops → immediate catch-up fetch, then a fetch every 1.5 s
    live.status = "reconnecting";
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.source).toBe("polling");
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(fetchJob).toHaveBeenLastCalledWith("job-1", 1); // since = events already held

    n = 3; // server produced two more events meanwhile
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(fetchJob).toHaveBeenCalledTimes(3);
    expect(result.current.events.map((e) => e.message)).toEqual(["starting", "poll 1", "poll 2"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(fetchJob).toHaveBeenCalledTimes(4);
    expect(result.current.job?.status).toBe("running");
  });

  it("stops polling once the job is terminal", async () => {
    const fetchJob = vi.fn(async () => jobDetail({ status: "complete", finished: 1010 }));
    live.status = "reconnecting";
    const { result } = renderHook(() => useJob("job-1", { fetchJob }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.terminal).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });
});
