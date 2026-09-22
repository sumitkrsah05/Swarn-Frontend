"use client";

/**
 * Watches one dashboard job (docs/eval_guide.md §3.4) and returns its
 * summary, result and ordered event list.
 *
 * Source selection:
 *  - while the shared /ws/live socket (lib/live.tsx) is "live", frames for
 *    this job are appended immediately and a slow safety poll reconciles;
 *  - otherwise (connecting / reconnecting / dropped) it polls
 *    GET /api/jobs/{id}?since=N every `pollIntervalMs` (default 1.5 s).
 *
 * REST is authoritative: the socket never replays history, so every
 * (re)connect triggers a catch-up fetch and websocket-received events are
 * kept in a separate tail that is discarded once REST has caught up. The run
 * state therefore survives a dropped socket and a page refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getJob as defaultGetJob } from "@/api/client";
import type { JobDetail, JobEvent, JobFrame, JobStatus } from "@/api/types";
import { useLiveFrames, useLiveStatus } from "@/lib/live";

const TERMINAL: ReadonlySet<string> = new Set(["complete", "failed", "cancelled"]);

export function isTerminalStatus(status: JobStatus | string | null | undefined) {
  return !!status && TERMINAL.has(status);
}

export type JobSource = "websocket" | "polling";

export interface UseJobOptions {
  /** REST poll period while the websocket is not live. Default 1500 ms. */
  pollIntervalMs?: number;
  /** Reconciliation poll period while the websocket is live. Default 10 s. */
  wsSafetyIntervalMs?: number;
  /** Cap on retained events. Default 2000. */
  maxEvents?: number;
  /** Injectable fetcher (tests). Defaults to api/client getJob. */
  fetchJob?: (id: string, since: number) => Promise<JobDetail>;
}

export interface UseJobResult {
  job: JobDetail | null;
  events: JobEvent[];
  error: string | null;
  /** where updates currently come from */
  source: JobSource;
  loading: boolean;
  terminal: boolean;
  /** force an authoritative REST fetch now */
  refresh: () => Promise<void>;
}

interface State {
  id: string | null;
  job: JobDetail | null;
  /** events confirmed by REST, in order; `cursor` = rest.length semantics */
  rest: JobEvent[];
  /** events received over the websocket since the last REST fetch */
  tail: JobEvent[];
  error: string | null;
}

const EMPTY: State = { id: null, job: null, rest: [], tail: [], error: null };

function fresh(id: string): State {
  return { id, job: null, rest: [], tail: [], error: null };
}

export function useJob(
  jobId: string | null,
  opts: UseJobOptions = {},
): UseJobResult {
  const {
    pollIntervalMs = 1500,
    wsSafetyIntervalMs = 10_000,
    maxEvents = 2000,
    fetchJob = defaultGetJob,
  } = opts;

  const wsStatus = useLiveStatus();
  const live = wsStatus === "live";

  const [state, setState] = useState<State>(EMPTY);
  const view = state.id === jobId ? state : EMPTY;

  const cursor = useRef<{ id: string | null; n: number }>({ id: null, n: 0 });
  const inflight = useRef(false);
  const statusRef = useRef<JobStatus | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    statusRef.current = view.job?.status ?? null;
  }, [view.job?.status]);

  const refresh = useCallback(async () => {
    if (!jobId || inflight.current) return;
    inflight.current = true;
    const id = jobId;
    const since = cursor.current.id === id ? cursor.current.n : 0;
    try {
      const d = await fetchJob(id, since);
      cursor.current = { id, n: d.n_events };
      setState((prev) => {
        const base = prev.id === id ? prev : fresh(id);
        const rest =
          since === 0 ? d.events : [...base.rest, ...d.events];
        return {
          id,
          job: d,
          rest: rest.slice(-maxEvents),
          tail: [],
          error: null,
        };
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setState((prev) => ({
        ...(prev.id === id ? prev : fresh(id)),
        error: message,
      }));
    } finally {
      inflight.current = false;
    }
  }, [jobId, fetchJob, maxEvents]);

  const scheduleRefresh = useCallback(
    (delay = 300) => {
      if (debounceTimer.current) return;
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        void refresh();
      }, delay);
    },
    [refresh],
  );

  // Initial load, catch-up on every websocket (re)connect, and the periodic
  // poll whose period depends on whether the socket is live.
  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    void refresh();
    const period = live ? wsSafetyIntervalMs : pollIntervalMs;
    const timer = setInterval(() => {
      if (stopped || isTerminalStatus(statusRef.current)) return;
      void refresh();
    }, period);
    return () => {
      stopped = true;
      clearInterval(timer);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [jobId, live, refresh, pollIntervalMs, wsSafetyIntervalMs]);

  // Websocket frames for this job: append instantly, then reconcile.
  useLiveFrames((frame) => {
    if (!jobId || frame.channel !== "job") return;
    const f = frame as unknown as JobFrame;
    if (f.job_id !== jobId || f.method !== "eval") return;

    let needsFetch = false;
    setState((prev) => {
      const base = prev.id === jobId ? prev : fresh(jobId);
      const tail = [...base.tail, f.event].slice(-maxEvents);
      let job = base.job;
      if (job) {
        job = {
          ...job,
          status: f.status,
          last_event: f.event,
          cancel_requested:
            job.cancel_requested || f.event.type === "cancel_requested",
        };
        // run_id and result only travel over REST
        if (!job.run_id) needsFetch = true;
      } else {
        needsFetch = true;
      }
      return { ...base, job, tail };
    });

    if (isTerminalStatus(f.status) || f.event.type === "status") {
      void refresh();
    } else if (needsFetch) {
      scheduleRefresh();
    }
  });

  const events = useMemo(
    () => (view.tail.length ? [...view.rest, ...view.tail] : view.rest),
    [view.rest, view.tail],
  );

  return {
    job: view.job,
    events,
    error: view.error,
    source: live ? "websocket" : "polling",
    loading: !!jobId && !view.job && !view.error,
    terminal: isTerminalStatus(view.job?.status),
    refresh,
  };
}
