"use client";

import type { Thread, ThreadStatus } from "@/lib/threads";
import { timeAgo } from "@/lib/format";

const STATUS_DOT: Record<ThreadStatus, string> = {
  idle: "bg-faint/50",
  queued: "bg-warn",
  running: "bg-accent animate-pulse",
  complete: "bg-ok",
  failed: "bg-err",
  cancelled: "bg-warn",
};

export function ThreadList({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: Thread[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-edge bg-panel/60">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-lg border border-edge bg-raised px-3 py-2 text-sm font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
        >
          + New chat
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {threads.length === 0 ? (
          <p className="px-2 pt-6 text-center text-xs text-faint">
            No conversations yet.
            <br />
            Send a message to start one.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((t) => (
              <li key={t.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={`w-full rounded-md px-2.5 py-2 pr-7 text-left transition-colors ${
                    t.id === activeId
                      ? "bg-raised text-fg"
                      : "text-muted hover:bg-raised/60 hover:text-fg"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      title={t.status}
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? STATUS_DOT.idle}`}
                    />
                    <span className="truncate text-sm">{t.title}</span>
                  </span>
                  <span className="mt-0.5 block pl-3.5 font-mono text-[10px] text-faint">
                    {t.messages.length} msg · {timeAgo(t.createdAt)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete "${t.title}"`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(t.id);
                  }}
                  className="absolute top-2 right-1.5 hidden rounded p-0.5 text-xs text-faint hover:text-err group-hover:block"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
