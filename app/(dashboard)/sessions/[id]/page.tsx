"use client";

/**
 * Session detail (docs/guide.md §8.2): the trace rendered read-only with the
 * workspace's thread components, plus the summary and tool counts. "Open in
 * workspace" imports the session as a new workspace with one turn.
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError, type SessionDetail } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/format";
import { promptFromTask, workspaceFromSession } from "@/lib/workspace-import";
import { OpenInWorkspaceButton, StaticThread } from "@/components/workspace/static-thread";
import { Badge, ErrorNote, Loading, TintCard } from "@/components/ui";

const NOT_FOUND = "Session not found — traces are only available once a run has completed.";

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSession(id)
      .then((s) => {
        if (cancelled) return;
        // the legacy endpoint answers 200 with {error} for an unknown id
        if (!s || !Array.isArray((s as SessionDetail).steps)) setError(NOT_FOUND);
        else setSession(s);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setError(NOT_FOUND);
        else setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // one workspace per session, so the read-only focus survives re-renders
  const ws = useMemo(() => (session ? workspaceFromSession(session) : null), [session]);

  if (error) {
    return (
      <div className="p-6">
        <ErrorNote message={error} />
        <Link href="/history?tab=sessions" className="mt-3 inline-block text-12 text-accent hover:underline">
          ← Back to history
        </Link>
      </div>
    );
  }
  if (!session || !ws) return <Loading label="Loading trace…" />;

  const tools = Object.entries(session.tool_counts ?? {});

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-edge bg-panel px-4 py-2.5 sm:px-5">
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-11">
          <Link href="/history?tab=sessions" className="text-muted hover:text-fg">
            History
          </Link>
          <span className="text-faint" aria-hidden>
            /
          </span>
          <span className="font-mono text-fg">{session.id.slice(0, 8)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Badge tone={session.outcome === "complete" ? "ok" : "warn"}>{session.outcome ?? "—"}</Badge>
          <h1 className="min-w-0 flex-1 basis-[16rem] truncate text-13 font-medium text-fg" title={session.task}>
            {promptFromTask(session.task)}
          </h1>
          <span className="flex flex-wrap items-center gap-x-3 font-mono text-11 text-muted">
            <span>session {session.id.slice(0, 8)}</span>
            <span>{session.model}</span>
            <span>{formatTime(session.started_at)}</span>
            <span>{formatDuration(session.duration_s)}</span>
          </span>
          <OpenInWorkspaceButton build={() => workspaceFromSession(session)} />
        </div>
        {(tools.length > 0 || session.summary) && (
          <div className="mt-2 flex flex-wrap items-start gap-2">
            {session.summary && (
              <TintCard role="grey" radius="card" className="max-w-3xl px-3 py-1.5 text-12 leading-snug text-fg">
                <span className="clamp-2 whitespace-pre-wrap">{session.summary}</span>
              </TintCard>
            )}
            <span className="flex flex-wrap gap-1">
              {tools.map(([tool, n]) => (
                <span key={tool} className="rounded-canvas border border-edge bg-panel px-2 py-0.5 font-mono text-10 text-muted">
                  {tool} <span className="text-fg">×{n}</span>
                </span>
              ))}
              {session.corrections > 0 && (
                <span className="rounded-canvas border border-warn/40 bg-warn-tint px-2 py-0.5 font-mono text-10 text-warn">corrections ×{session.corrections}</span>
              )}
            </span>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1">
        <StaticThread ws={ws} />
      </div>
    </div>
  );
}
