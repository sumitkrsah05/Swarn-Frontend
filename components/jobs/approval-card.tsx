"use client";

/**
 * Parked agent questions on a job page (docs/guide.md §7.6, outside the
 * workspace): every `approval_request` event that has no matching
 * `approval_answered` yet, as an amber card with option buttons and a
 * free-text answer. Answers go to POST /api/jobs/{id}/approve; a 409 means
 * the question timed out and took its default.
 */

import { useState } from "react";
import { api, ApiError, type JobEvent } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ArrowUpIcon, IconButton, RobotIcon, TintCard } from "@/components/ui";

export interface PendingQuestion {
  requestId: string;
  question: string;
  options: string[];
  default?: string;
}

/** Questions still waiting for an answer, from a job's event list. */
export function pendingQuestions(events: JobEvent[]): PendingQuestion[] {
  const answered = new Set<string>();
  for (const e of events) if (e.type === "approval_answered" && e.request_id) answered.add(e.request_id);
  const out: PendingQuestion[] = [];
  for (const e of events) {
    if (e.type !== "approval_request") continue;
    const raw = e as unknown as { id?: unknown };
    const id = e.request_id ?? (typeof raw.id === "string" ? raw.id : undefined);
    if (!id || answered.has(id) || typeof e.question !== "string") continue;
    out.push({
      requestId: id,
      question: e.question,
      options: Array.isArray(e.options) ? e.options.filter((o): o is string => typeof o === "string") : [],
      default: typeof e.default === "string" ? e.default : undefined,
    });
  }
  return out;
}

export function ApprovalCard({ jobId, q, onAnswered }: { jobId: string; q: PendingQuestion; onAnswered?: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const answer = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await api.approveJob(jobId, q.requestId, value.trim());
      toast("success", "Answer sent");
      onAnswered?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast("info", "That question timed out and the agent took its default answer.");
      else toast("error", e instanceof Error ? e.message : "Failed to send the answer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TintCard role="ask" radius="panel" className="px-3 py-2.5">
      <div className="flex items-center gap-2 text-ask">
        <RobotIcon size={14} className="animate-bounce-soft motion-reduce:animate-none" />
        <span className="text-11 font-bold tracking-[0.04em] uppercase">Question</span>
        <span className="ml-auto font-mono text-10 text-faint">awaiting your answer</span>
      </div>
      <p className="mt-1.5 text-12 text-fg">{q.question}</p>
      {q.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {q.options.map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy}
              onClick={() => answer(o)}
              className="rounded-card border border-edge bg-panel px-2.5 py-1 text-12 text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {o}
              {q.default === o && <span className="ml-1 text-10 text-faint">default</span>}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void answer(text).then(() => setText(""));
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type your own answer…"
          aria-label="Your answer"
          className="h-7 min-w-0 flex-1 rounded-chip border border-edge bg-panel px-2 text-12 text-fg placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <IconButton label="Send answer" tone="primary" type="submit" size={28} disabled={busy}>
          <ArrowUpIcon size={14} />
        </IconButton>
      </form>
    </TintCard>
  );
}
