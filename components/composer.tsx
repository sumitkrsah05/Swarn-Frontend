"use client";

import { useRef, useState } from "react";
import { uploadFiles } from "@/lib/api";
import type { ChatAttachment } from "@/lib/threads";
import { useToast } from "@/components/toast";

export function Composer({
  disabled,
  running,
  onSend,
  onStop,
}: {
  /** job queued/running — composing is blocked until it settles */
  disabled: boolean;
  running: boolean;
  onSend: (text: string, attachment: ChatAttachment | null) => void;
  onStop: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = !disabled && uploadPct === null && text.trim().length > 0;

  const doUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadPct(0);
    try {
      const res = await uploadFiles(files, setUploadPct);
      setAttachment({
        data_dir: res.data_dir,
        label: res.relative_dir,
        files: res.files,
      });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadPct(null);
    }
  };

  const send = () => {
    if (!canSend) return;
    onSend(text, attachment);
    setText("");
    setAttachment(null);
  };

  const rows = Math.min(6, Math.max(1, text.split("\n").length));

  return (
    <div className="border-t border-edge bg-panel/40 px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {attachment && (
          <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-md border border-ok/40 bg-ok/5 px-2.5 py-1.5 font-mono text-xs text-fg">
            <span aria-hidden>📎</span>
            <span className="truncate">{attachment.label}</span>
            <span className="shrink-0 text-muted">
              {attachment.files.length} file(s)
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="shrink-0 text-muted hover:text-err"
              aria-label="Remove attachment"
            >
              ✕
            </button>
          </div>
        )}
        {uploadPct !== null && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-edge border-t-accent" />
            Uploading… {Math.round(uploadPct * 100)}%
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploadPct !== null}
            title="Attach files (uploaded to the agent workspace)"
            className="shrink-0 rounded-lg border border-edge bg-panel px-3 py-2.5 text-sm text-muted transition-colors hover:border-faint hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void doUpload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={rows}
            disabled={disabled}
            placeholder={
              disabled ? "swarn is working…" : "Message swarn…  (Enter to send)"
            }
            className="min-w-0 flex-1 resize-none rounded-lg border border-edge bg-panel px-3 py-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-60"
          />

          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-lg border border-err/50 px-4 py-2.5 text-sm font-medium text-err transition-colors hover:bg-err/10"
            >
              ◼ Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
