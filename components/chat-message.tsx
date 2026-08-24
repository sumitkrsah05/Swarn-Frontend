"use client";

import Link from "next/link";
import { workspaceFileUrl } from "@/lib/api";
import { extractFileMentions, formatClock, isImagePath } from "@/lib/format";
import type { ChatMessage } from "@/lib/threads";
import { Markdown } from "@/components/markdown";

function AttachmentChip({
  label,
  files,
}: {
  label: string;
  files: string[];
}) {
  return (
    <div
      className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-edge bg-raised/60 px-2 py-1 font-mono text-[11px] text-muted"
      title={files.join(", ")}
    >
      <span aria-hidden>📎</span>
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-faint">· {files.length} file(s)</span>
    </div>
  );
}

function FileLinks({ text }: { text: string }) {
  const files = extractFileMentions(text);
  if (files.length === 0) return null;
  const images = files.filter(isImagePath);
  return (
    <div className="mt-3 border-t border-edge pt-3">
      <div className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <a
            key={f}
            href={workspaceFileUrl(f)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-edge bg-raised/60 px-2 py-1 font-mono text-[11px] text-accent hover:border-accent/60"
          >
            <span aria-hidden>{isImagePath(f) ? "🖼" : "⇩"}</span>
            {f}
          </a>
        ))}
      </div>
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((f) => (
            <a key={f} href={workspaceFileUrl(f)} target="_blank" rel="noreferrer">
              {/* workspace previews are arbitrary agent output — plain <img> */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={workspaceFileUrl(f)}
                alt={f}
                className="max-h-64 max-w-full rounded-md border border-edge"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatMessageView({
  msg,
  onRetry,
  canRetry,
}: {
  msg: ChatMessage;
  onRetry?: () => void;
  canRetry?: boolean;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-accent/25 bg-accent/10 px-4 py-2.5 text-sm whitespace-pre-wrap text-fg">
          {msg.text}
        </div>
        {msg.attachment && (
          <AttachmentChip
            label={msg.attachment.label}
            files={msg.attachment.files}
          />
        )}
        {msg.failure && (
          <div className="mt-2 max-w-[85%] rounded-lg border border-err/40 bg-err/5 px-3.5 py-2.5 text-sm text-err">
            <span className="break-words">{msg.failure}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={!canRetry}
                className="ml-3 rounded-md border border-err/50 px-2 py-0.5 text-xs font-medium hover:bg-err/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-bl-sm border border-edge bg-panel px-4 py-3">
        <Markdown>{msg.text}</Markdown>
        <FileLinks text={msg.text} />
      </div>
      <div className="mt-1 flex items-center gap-2 pl-1 font-mono text-[11px] text-faint">
        {msg.outcome && (
          <span className={msg.outcome === "success" ? "text-ok" : "text-warn"}>
            {msg.outcome}
          </span>
        )}
        {msg.sessionId && (
          <Link
            href={`/sessions/${encodeURIComponent(msg.sessionId)}`}
            className="text-accent hover:underline"
          >
            view trace
          </Link>
        )}
        <span>{formatClock(msg.ts)}</span>
      </div>
    </div>
  );
}
