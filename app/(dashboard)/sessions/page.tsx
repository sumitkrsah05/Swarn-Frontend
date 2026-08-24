"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type SessionSummary } from "@/lib/api";
import { formatDuration, formatTime } from "@/lib/format";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/ui";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSessions(100)
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Sessions"
        subtitle="Completed ReAct agent sessions with their full step traces."
      />

      {error && <ErrorNote message={error} />}
      {sessions === null && !error && <Spinner label="Loading sessions…" />}
      {sessions !== null && sessions.length === 0 && (
        <EmptyState title="No sessions yet" hint="ReAct and Team runs record a session trace here." />
      )}

      {sessions !== null && sessions.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-edge">
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/sessions/${s.id}`}
              className="flex items-center gap-4 border-b border-edge bg-panel px-4 py-3 last:border-b-0 hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{s.task}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 font-mono text-xs text-faint">
                  <span>{s.id.slice(0, 8)}</span>
                  <span>{s.model}</span>
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-xs">
                <div
                  className={
                    s.outcome === "complete" ? "text-ok" : "text-warn"
                  }
                >
                  {s.outcome ?? "—"}
                </div>
                <div className="mt-0.5 text-faint">
                  {s.tool_calls} tools · {s.corrections} fixes ·{" "}
                  {formatDuration(s.duration_s)}
                </div>
              </div>
              <div className="w-32 shrink-0 text-right text-xs text-faint">
                {formatTime(s.started_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
