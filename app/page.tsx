"use client";

/**
 * Chat with the swarn agent. Each user message becomes a `react` job whose
 * `resume_session_ids` carries the thread's full session chain (see
 * lib/threads.ts). Progress arrives over /ws/live when available, with
 * GET /api/jobs/{id} polling as the authoritative fallback — the websocket
 * never replays, so terminal states are always confirmed via REST.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  type JobDetail,
  type JobStatus,
  type SessionStep,
} from "@/lib/api";
import { useLiveFrames } from "@/lib/live";
import {
  makeThread,
  useThreadStore,
  type ChatAttachment,
  type ChatMessage,
  type Thread,
} from "@/lib/threads";
import { ThreadList } from "@/components/thread-list";
import { ChatMessageView } from "@/components/chat-message";
import { WorkingFeed } from "@/components/working-feed";
import { Composer } from "@/components/composer";
import { StatusBadge, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";

const POLL_MS = 2500;
const FEED_CAP = 500;

export default function ChatPage() {
  const toast = useToast();
  const {
    threads,
    setThreads,
    activeId,
    setActiveId,
    loaded,
    updateThread,
    addThread,
    deleteThread,
  } = useThreadStore();

  // Live step feed per job id (session-channel frames; not persisted).
  const [feeds, setFeeds] = useState<Record<string, SessionStep[]>>({});

  const threadsRef = useRef<Thread[]>(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);
  const sessionToJob = useRef(new Map<string, string>());
  const seenEvents = useRef(new Map<string, number>());
  const pollInFlight = useRef(new Set<string>());

  // ------------------------------------------------------ job completion

  const finalize = useCallback(
    (
      jobId: string,
      status: JobStatus,
      result: JobDetail["result"],
      error: string | null,
    ) => {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.activeJobId !== jobId) return t;
          if (status === "complete") {
            const sessionId =
              typeof result?.session_id === "string"
                ? result.session_id
                : undefined;
            const assistant: ChatMessage = {
              id: crypto.randomUUID(),
              role: "assistant",
              text:
                result?.summary?.trim() ||
                "(The run completed without a summary.)",
              ts: Date.now() / 1000,
              sessionId,
              outcome:
                typeof result?.outcome === "string" ? result.outcome : undefined,
            };
            return {
              ...t,
              activeJobId: null,
              status,
              sessionIds:
                sessionId && !t.sessionIds.includes(sessionId)
                  ? [...t.sessionIds, sessionId]
                  : t.sessionIds,
              messages: [...t.messages, assistant],
            };
          }
          // failed / cancelled → pin the error to the message that caused it
          const failure =
            status === "cancelled"
              ? "The run was cancelled."
              : error || "The run failed without an error message.";
          const messages = [...t.messages];
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "user") {
              messages[i] = { ...messages[i], failure };
              break;
            }
          }
          return { ...t, activeJobId: null, status, messages };
        }),
      );
      setFeeds((prev) => {
        if (!(jobId in prev)) return prev;
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
    },
    [setThreads],
  );

  const handleJobDetail = useCallback(
    (jobId: string, job: JobDetail) => {
      seenEvents.current.set(jobId, job.n_events);
      if (job.session_id) sessionToJob.current.set(job.session_id, jobId);
      for (const ev of job.events) {
        if (ev.type === "session" && ev.session_id) {
          sessionToJob.current.set(ev.session_id, jobId);
        }
      }
      if (job.status === "queued" || job.status === "running") {
        setThreads((prev) =>
          prev.map((t) =>
            t.activeJobId === jobId && t.status !== job.status
              ? { ...t, status: job.status }
              : t,
          ),
        );
      } else {
        finalize(jobId, job.status, job.result, job.error);
      }
    },
    [finalize, setThreads],
  );

  const pollJob = useCallback(
    (jobId: string) => {
      if (pollInFlight.current.has(jobId)) return;
      pollInFlight.current.add(jobId);
      api
        .getJob(jobId, seenEvents.current.get(jobId) ?? 0)
        .then((job) => handleJobDetail(jobId, job))
        .catch((e) => {
          // 404 = the backend restarted and forgot the job; anything transient
          // (network, 5xx) is retried on the next tick.
          if (e instanceof ApiError && e.status === 404) {
            finalize(
              jobId,
              "failed",
              null,
              "The server no longer knows this job (was it restarted?). Retry to resubmit.",
            );
          }
        })
        .finally(() => pollInFlight.current.delete(jobId));
    },
    [handleJobDetail, finalize],
  );

  // Poll every active job — also reconciles runs that finished while the tab
  // was closed, since activeJobId is persisted.
  useEffect(() => {
    if (!loaded) return;
    const tick = () => {
      for (const t of threadsRef.current) {
        if (t.activeJobId) pollJob(t.activeJobId);
      }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => clearInterval(iv);
  }, [loaded, pollJob]);

  // ------------------------------------------------------ live frames

  useLiveFrames(
    useCallback(
      (frame) => {
        if (frame.channel === "job") {
          if (!threadsRef.current.some((t) => t.activeJobId === frame.job_id))
            return;
          if (frame.event?.type === "session" && frame.event.session_id) {
            sessionToJob.current.set(frame.event.session_id, frame.job_id);
          }
          if (frame.status === "queued" || frame.status === "running") {
            setThreads((prev) =>
              prev.map((t) =>
                t.activeJobId === frame.job_id && t.status !== frame.status
                  ? { ...t, status: frame.status }
                  : t,
              ),
            );
          } else {
            // terminal — confirm result/error over REST
            pollJob(frame.job_id);
          }
        } else if (frame.channel === "session") {
          const jobId = sessionToJob.current.get(frame.session_id);
          if (!jobId) return;
          setFeeds((prev) => {
            const cur = prev[jobId] ?? [];
            const next = cur.length >= FEED_CAP ? cur.slice(-FEED_CAP + 1) : [...cur];
            next.push({
              kind: frame.kind,
              time: frame.timestamp,
              data: frame.data,
            });
            return { ...prev, [jobId]: next };
          });
        }
      },
      [pollJob, setThreads],
    ),
  );

  // ------------------------------------------------------ sending

  const submitJob = useCallback(
    async (threadId: string, msg: ChatMessage, sessionIds: string[]) => {
      try {
        const job = await api.createJob({
          task: msg.text,
          method: "react",
          data_dir: msg.attachment?.data_dir ?? null,
          // full chain, oldest first — a session trace only records its own
          // turns, so dropping earlier ids drops that context
          resume_session_ids: sessionIds,
        });
        seenEvents.current.set(job.id, 0);
        if (job.session_id) sessionToJob.current.set(job.session_id, job.id);
        updateThread(threadId, (t) => ({
          ...t,
          activeJobId: job.id,
          jobIds: [...t.jobIds, job.id],
          status: job.status,
        }));
      } catch (e) {
        const failure =
          e instanceof Error ? e.message : "Failed to submit the job.";
        updateThread(threadId, (t) => ({
          ...t,
          status: "failed",
          messages: t.messages.map((m) =>
            m.id === msg.id ? { ...m, failure } : m,
          ),
        }));
      }
    },
    [updateThread],
  );

  const send = useCallback(
    (text: string, attachment: ChatAttachment | null) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
        ts: Date.now() / 1000,
        attachment: attachment ?? undefined,
      };
      let threadId = activeId;
      let sessionIds: string[] = [];
      if (threadId) {
        const t = threadsRef.current.find((x) => x.id === threadId);
        if (!t || t.activeJobId) return; // composer is disabled while running
        sessionIds = t.sessionIds;
        updateThread(threadId, (th) => ({
          ...th,
          status: "queued",
          messages: [...th.messages, msg],
        }));
      } else {
        const t = makeThread(trimmed);
        t.messages = [msg];
        t.status = "queued";
        addThread(t);
        setActiveId(t.id);
        threadId = t.id;
      }
      void submitJob(threadId, msg, sessionIds);
    },
    [activeId, addThread, setActiveId, submitJob, updateThread],
  );

  const retry = useCallback(
    (threadId: string, messageId: string) => {
      const t = threadsRef.current.find((x) => x.id === threadId);
      const msg = t?.messages.find((m) => m.id === messageId);
      if (!t || !msg || t.activeJobId) return;
      updateThread(threadId, (th) => ({
        ...th,
        status: "queued",
        messages: th.messages.map((m) =>
          m.id === messageId ? { ...m, failure: undefined } : m,
        ),
      }));
      void submitJob(threadId, msg, t.sessionIds);
    },
    [submitJob, updateThread],
  );

  const stop = useCallback(
    (thread: Thread) => {
      if (!thread.activeJobId) return;
      api.cancelJob(thread.activeJobId).catch((e) => {
        toast(
          "error",
          e instanceof Error ? e.message : "Failed to cancel the run",
        );
      });
    },
    [toast],
  );

  const removeThread = useCallback(
    (id: string) => {
      const t = threadsRef.current.find((x) => x.id === id);
      if (!t) return;
      const note = t.activeJobId
        ? " Its run keeps going on the server (see Jobs)."
        : "";
      if (window.confirm(`Delete "${t.title}"?${note}`)) deleteThread(id);
    },
    [deleteThread],
  );

  // ------------------------------------------------------ rendering

  const active = useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );
  const inFlight =
    active?.status === "queued" || active?.status === "running";
  const activeFeed =
    (active?.activeJobId && feeds[active.activeJobId]) || [];

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  useEffect(() => {
    stickToBottom.current = true; // jump to the end when switching threads
  }, [activeId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [activeId, active?.messages.length, activeFeed.length, inFlight]);

  if (!loaded) {
    return <Spinner label="Loading conversations…" />;
  }

  return (
    <div className="flex h-full">
      <ThreadList
        threads={threads}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setActiveId(null)}
        onDelete={removeThread}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-edge px-5 py-3">
              <h1 className="min-w-0 truncate text-sm font-semibold text-fg">
                {active.title}
              </h1>
              {active.status !== "idle" && (
                <StatusBadge status={active.status} />
              )}
              <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                {active.sessionIds.length} session
                {active.sessionIds.length === 1 ? "" : "s"}
              </span>
            </header>

            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                stickToBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 120;
              }}
              className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
            >
              <div className="mx-auto max-w-3xl space-y-5">
                {active.messages.map((m) => (
                  <ChatMessageView
                    key={m.id}
                    msg={m}
                    onRetry={
                      m.failure ? () => retry(active.id, m.id) : undefined
                    }
                    canRetry={!inFlight}
                  />
                ))}
                {inFlight && (
                  <WorkingFeed steps={activeFeed} status={active.status} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 font-mono text-xl font-bold text-accent">
              s
            </div>
            <h1 className="text-lg font-semibold text-fg">
              Chat with swarn
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-muted">
              Describe a task and the agent will reason, run tools, and reply
              with a summary. Attach files to give it data; follow-ups continue
              the same conversation.
            </p>
          </div>
        )}

        <Composer
          key={activeId ?? "new"}
          disabled={inFlight}
          running={inFlight}
          onSend={send}
          onStop={() => active && stop(active)}
        />
      </div>
    </div>
  );
}
