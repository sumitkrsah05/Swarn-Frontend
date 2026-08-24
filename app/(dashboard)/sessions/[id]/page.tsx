"use client";

import { use, useEffect, useState } from "react";
import { api, ApiError, type SessionDetail } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/format";
import { StepTimeline } from "@/components/step-timeline";
import { ErrorNote, PageHeader, Spinner } from "@/components/ui";

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSession(id)
      .then(setSession)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setError(
            "Session not found — traces are only available once a run has completed.",
          );
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
  }, [id]);

  if (error) return <ErrorNote message={error} />;
  if (!session) return <Spinner label="Loading trace…" />;

  return (
    <div>
      <PageHeader
        title={<span className="whitespace-pre-wrap text-base">{session.task}</span>}
        subtitle={
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
            <span>session {session.id.slice(0, 8)}</span>
            <span>{session.model}</span>
            <span>{formatTime(session.started_at)}</span>
            <span>{formatDuration(session.duration_s)}</span>
            <span
              className={session.outcome === "complete" ? "text-ok" : "text-warn"}
            >
              {session.outcome ?? "—"}
            </span>
          </div>
        }
      />

      {session.summary && (
        <div className="mb-5 rounded-lg border border-edge bg-panel px-4 py-3 text-sm text-fg">
          {session.summary}
        </div>
      )}

      {Object.keys(session.tool_counts ?? {}).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(session.tool_counts).map(([tool, n]) => (
            <span
              key={tool}
              className="rounded-full border border-edge bg-panel px-2.5 py-0.5 font-mono text-[11px] text-muted"
            >
              {tool} <span className="text-fg">×{n}</span>
            </span>
          ))}
          {session.corrections > 0 && (
            <span className="rounded-full border border-warn/40 bg-warn/5 px-2.5 py-0.5 font-mono text-[11px] text-warn">
              corrections ×{session.corrections}
            </span>
          )}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-fg">
        Steps{" "}
        <span className="font-mono text-xs font-normal text-faint">
          {session.steps.length}
        </span>
      </h2>
      <StepTimeline steps={session.steps.slice(-500)} />
    </div>
  );
}
