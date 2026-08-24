"use client";

/**
 * Client-owned chat threads. The backend is stateless between jobs — a
 * conversation is stitched together by resubmitting the FULL list of prior
 * session ids (oldest first) as `resume_session_ids` on every new job, and
 * appending the resulting session id when that job completes. Threads live in
 * localStorage; live step feeds do not (they are re-derived from /ws/live).
 */

import { useCallback, useEffect, useState } from "react";
import type { JobStatus } from "./api";

export type ThreadStatus = JobStatus | "idle";

export interface ChatAttachment {
  data_dir: string;
  label: string;
  files: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** unix seconds */
  ts: number;
  /** user messages: uploaded dataset passed as data_dir */
  attachment?: ChatAttachment;
  /** assistant messages: the session that produced this reply */
  sessionId?: string;
  outcome?: string;
  /** user messages: the run for this message failed / was cancelled */
  failure?: string;
}

export interface Thread {
  id: string;
  title: string;
  /** unix seconds */
  createdAt: number;
  /** completed session ids, oldest first — the resume chain */
  sessionIds: string[];
  jobIds: string[];
  /** job currently queued/running for this thread, if any */
  activeJobId: string | null;
  status: ThreadStatus;
  messages: ChatMessage[];
}

const STORAGE_KEY = "swarn:threads:v1";
const TITLE_MAX = 48;

export function makeThread(firstTask: string): Thread {
  const title =
    firstTask.length > TITLE_MAX
      ? firstTask.slice(0, TITLE_MAX).trimEnd() + "…"
      : firstTask;
  return {
    id: crypto.randomUUID(),
    title: title || "New chat",
    createdAt: Date.now() / 1000,
    sessionIds: [],
    jobIds: [],
    activeJobId: null,
    status: "idle",
    messages: [],
  };
}

function sanitizeThreads(raw: unknown): Thread[] {
  if (!Array.isArray(raw)) return [];
  const out: Thread[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if (typeof o.id !== "string" || !Array.isArray(o.messages)) continue;
    const activeJobId = typeof o.activeJobId === "string" ? o.activeJobId : null;
    let status = (
      typeof o.status === "string" ? o.status : "idle"
    ) as ThreadStatus;
    // an in-flight status without a job to poll can never resolve
    if (!activeJobId && (status === "queued" || status === "running")) {
      status = "idle";
    }
    out.push({
      id: o.id,
      title: typeof o.title === "string" ? o.title : "Untitled",
      createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
      sessionIds: Array.isArray(o.sessionIds)
        ? o.sessionIds.filter((s): s is string => typeof s === "string")
        : [],
      jobIds: Array.isArray(o.jobIds)
        ? o.jobIds.filter((s): s is string => typeof s === "string")
        : [],
      activeJobId,
      status,
      messages: o.messages as ChatMessage[],
    });
  }
  return out;
}

export function useThreadStore() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // localStorage is only readable on the client, and the page is statically
  // prerendered — hydrate empty, then load once after mount.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          threads?: unknown;
          activeId?: unknown;
        };
        const ts = sanitizeThreads(data.threads);
        setThreads(ts);
        if (
          typeof data.activeId === "string" &&
          ts.some((t) => t.id === data.activeId)
        ) {
          setActiveId(data.activeId);
        }
      }
    } catch {
      /* corrupted store — start fresh */
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ threads, activeId }));
    } catch {
      /* quota / private mode — chat still works, just unpersisted */
    }
  }, [threads, activeId, loaded]);

  const updateThread = useCallback(
    (id: string, fn: (t: Thread) => Thread) =>
      setThreads((prev) => prev.map((t) => (t.id === id ? fn(t) : t))),
    [],
  );

  const addThread = useCallback(
    (t: Thread) => setThreads((prev) => [t, ...prev]),
    [],
  );

  const deleteThread = useCallback((id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    setActiveId((a) => (a === id ? null : a));
  }, []);

  return {
    threads,
    setThreads,
    activeId,
    setActiveId,
    loaded,
    updateThread,
    addThread,
    deleteThread,
  };
}
