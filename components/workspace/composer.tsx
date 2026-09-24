"use client";

/**
 * The composer (docs/guide.md §2.5): an outlined 12px-radius card with the
 * soft double shadow; a context chip row (the focused dataset as a fixed
 * @chip, removable @mentions, attachments); a starter-question row (⚡);
 * a 2–6 row textarea (Enter sends, Shift+Enter newline, Tab on empty fills,
 * @ opens a combobox); the toolbar (+ attach · Generate a report · Suggest
 * next steps · round send); the working overlay while a job runs; and the
 * agent-question panel docked inside its top edge (§7.6).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { uploadFiles } from "@/lib/api";
import { TAB_FILL } from "@/lib/starters";
import type { AgentQuestion, ChatAttachment } from "@/lib/workspace";
import { useToast } from "@/components/toast";
import { formatElapsed } from "./thread/thinking";
import {
  ArrowUpIcon,
  BoltIcon,
  BulbIcon,
  CloseIcon,
  DocumentIcon,
  IconButton,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  Popover,
  ProgressBar,
  RobotIcon,
  StopIcon,
  TableIcon,
} from "@/components/ui";

export interface ComposerSubmit {
  text: string;
  attachment: ChatAttachment | null;
  mentions: string[];
}

export interface ComposerProps {
  variant: "docked" | "big";
  onSend: (s: ComposerSubmit) => void;
  /** a job is running in this workspace */
  running?: boolean;
  runningLabel?: string;
  runningSince?: number | null;
  onStop?: () => void;
  /** the focused dataset — a fixed @chip */
  focusedDataset?: string | null;
  /** names available to the @ picker */
  datasetNames?: string[];
  /** starter questions (only when a source table is focused and the agent is idle) */
  starters?: string[];
  onReport?: () => void;
  onSuggest?: () => void;
  question?: AgentQuestion | null;
  onAnswer?: (text: string) => void;
  onDismissQuestion?: () => void;
  placeholder?: string;
  /** landing: the "Try asking" dropdown */
  tryAsking?: string[];
  /** the Datasets panel asked for an @mention */
  mentionRequest?: { name: string; nonce: number } | null;
  /** the Add-data panel attached an upload */
  attachRequest?: { attachment: ChatAttachment; nonce: number } | null;
  /** a landing example prefilled the text */
  prefill?: { text: string; nonce: number } | null;
  initialText?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

const MENTION_RE = /@([\w.-]+)/g;

export function mentionsIn(text: string, known: string[]): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const name = m[1];
    if (known.includes(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

export function Composer({
  variant,
  onSend,
  running = false,
  runningLabel,
  runningSince,
  onStop,
  focusedDataset,
  datasetNames = [],
  starters = [],
  onReport,
  onSuggest,
  question,
  onAnswer,
  onDismissQuestion,
  placeholder = "Ask a question or describe what to explore (add context with @)",
  tryAsking,
  mentionRequest,
  attachRequest,
  prefill,
  initialText = "",
  autoFocus,
  disabled = false,
}: ComposerProps) {
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [showStarters, setShowStarters] = useState(true);
  const [focused, setFocused] = useState(false);
  const [tryOpen, setTryOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [picker, setPicker] = useState<{ start: number; query: string } | null>(null);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [elapsed, setElapsed] = useState("");
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [areaEl, setAreaEl] = useState<HTMLTextAreaElement | null>(null);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const lastMention = useRef(0);
  const lastAttach = useRef(0);
  const lastPrefill = useRef(0);

  const busy = running || disabled;
  const canSend = !busy && uploadPct === null && text.trim().length > 0;
  const mentions = useMemo(() => mentionsIn(text, datasetNames), [text, datasetNames]);
  const allMentions = useMemo(() => {
    const out = focusedDataset ? [focusedDataset] : [];
    for (const m of mentions) if (!out.includes(m)) out.push(m);
    return out;
  }, [focusedDataset, mentions]);

  // elapsed ticker for the working overlay
  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed(runningSince ? formatElapsed(Date.now() / 1000 - runningSince) : "");
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running, runningSince]);

  // the Datasets panel asked us to @-mention something
  useEffect(() => {
    if (!mentionRequest || mentionRequest.nonce === lastMention.current) return;
    lastMention.current = mentionRequest.nonce;
    setText((t) => (t.includes(`@${mentionRequest.name}`) ? t : `${t}${t && !t.endsWith(" ") ? " " : ""}@${mentionRequest.name} `));
    areaRef.current?.focus();
  }, [mentionRequest]);

  useEffect(() => {
    if (!attachRequest || attachRequest.nonce === lastAttach.current) return;
    lastAttach.current = attachRequest.nonce;
    setAttachment(attachRequest.attachment);
    areaRef.current?.focus();
  }, [attachRequest]);

  useEffect(() => {
    if (!prefill || prefill.nonce === lastPrefill.current) return;
    lastPrefill.current = prefill.nonce;
    setText(prefill.text);
    areaRef.current?.focus();
  }, [prefill]);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  const rows = Math.min(6, Math.max(variant === "big" ? 3 : 2, text.split("\n").length));

  const doUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadPct(0);
      try {
        const res = await uploadFiles(files, setUploadPct);
        setAttachment({ data_dir: res.data_dir, label: res.relative_dir, files: res.files });
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploadPct(null);
      }
    },
    [toast],
  );

  const send = useCallback(
    (override?: string) => {
      const value = (override ?? text).trim();
      if (!value || busy || uploadPct !== null) return;
      onSend({ text: value, attachment, mentions: allMentions });
      setText("");
      setAttachment(null);
      setPicker(null);
    },
    [text, busy, uploadPct, onSend, attachment, allMentions],
  );

  const pickerItems = useMemo(() => {
    if (!picker) return [];
    const q = picker.query.toLowerCase();
    return datasetNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [picker, datasetNames]);

  const applyPick = (name: string) => {
    if (!picker) return;
    const before = text.slice(0, picker.start);
    const after = text.slice(picker.start + 1 + picker.query.length);
    const next = `${before}@${name} ${after}`;
    setText(next);
    setPicker(null);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (el) {
        const pos = before.length + name.length + 2;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const onChange = (value: string, caret: number) => {
    setText(value);
    // an "@" typed (or being typed) opens the dataset picker
    const upto = value.slice(0, caret);
    const m = /(?:^|\s)@([\w.-]*)$/.exec(upto);
    if (m && datasetNames.length) {
      setPicker({ start: upto.length - m[1].length - 1, query: m[1] });
      setPickerIndex(0);
    } else {
      setPicker(null);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (picker && pickerItems.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPickerIndex((i) => (i + 1) % pickerItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPickerIndex((i) => (i - 1 + pickerItems.length) % pickerItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyPick(pickerItems[pickerIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPicker(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && text.trim() === "") {
      e.preventDefault();
      setText(TAB_FILL);
    }
  };

  const removeMention = (name: string) => {
    setText((t) => t.replace(new RegExp(`\\s?@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "").replace(/\s{2,}/g, " "));
  };

  const shell =
    variant === "big"
      ? "w-full max-w-[800px]"
      : "mx-auto w-full max-w-[640px]";

  return (
    <div className={`@container ${shell}`}>
      <div
        ref={setCardEl}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dataset = e.dataTransfer.getData("text/x-swarn-dataset");
          if (dataset) {
            setText((t) => (t.includes(`@${dataset}`) ? t : `${t}${t && !t.endsWith(" ") ? " " : ""}@${dataset} `));
            areaRef.current?.focus();
            return;
          }
          const files = Array.from(e.dataTransfer.files);
          if (files.length) void doUpload(files);
        }}
        className={`relative overflow-hidden rounded-composer border bg-panel shadow-composer transition-[border-color,box-shadow] ${
          focused ? "border-accent ring-2 ring-accent/15" : dragOver ? "border-accent border-dashed" : "border-edge"
        }`}
      >
        {/* agent question panel (§7.6) */}
        {question && (
          <div className="border-b border-ask/40 bg-ask-tint">
            <div className="flex items-center gap-2 px-3 py-1.5 text-ask">
              <RobotIcon size={14} className="animate-bounce-soft motion-reduce:animate-none" />
              <span className="text-11 font-bold tracking-[0.04em] uppercase">Question</span>
              <IconButton label="Dismiss" size={22} className="ml-auto" onClick={onDismissQuestion}>
                <CloseIcon size={12} />
              </IconButton>
            </div>
            <div className="px-3 pb-2.5">
              <p className="text-12 text-fg">
                <span className="mr-1 font-mono text-11 text-muted">1.</span>
                {question.question}
              </p>
              {question.options.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {question.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => onAnswer?.(o)}
                      className="rounded-card border border-edge bg-panel px-2.5 py-1 text-12 text-fg transition-colors hover:border-accent hover:text-accent"
                    >
                      {o}
                      {question.default === o && <span className="ml-1 text-10 text-faint">default</span>}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="mt-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (answerText.trim()) {
                    onAnswer?.(answerText.trim());
                    setAnswerText("");
                  }
                }}
              >
                <input
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Or type your own answer…"
                  aria-label="Your answer"
                  className="h-7 min-w-0 flex-1 rounded-chip border border-edge bg-panel px-2 text-12 text-fg placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <IconButton label="Send answer" tone="primary" type="submit" size={28}>
                  <ArrowUpIcon size={14} />
                </IconButton>
              </form>
            </div>
          </div>
        )}

        {/* context chips */}
        {(allMentions.length > 0 || attachment || uploadPct !== null) && (
          <div className="flex flex-wrap items-center gap-1 px-2.5 pt-2">
            {allMentions.map((name) => {
              const fixed = name === focusedDataset;
              return (
                <span
                  key={name}
                  className={`inline-flex h-6 items-center gap-1 rounded-chip border px-1.5 font-mono text-11 ${
                    fixed ? "border-accent/40 bg-accent-tint text-accent" : "border-edge bg-raised text-fg"
                  }`}
                  title={fixed ? "the focused dataset" : "mentioned dataset"}
                >
                  <TableIcon size={11} />@{name}
                  {!fixed && (
                    <button type="button" onClick={() => removeMention(name)} aria-label={`Remove @${name}`} className="text-muted hover:text-err">
                      <CloseIcon size={10} />
                    </button>
                  )}
                </span>
              );
            })}
            {attachment && (
              <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-chip border border-edge bg-raised px-1.5 font-mono text-11 text-fg" title={attachment.files.join(", ")}>
                <PaperclipIcon size={11} />
                <span className="truncate">{attachment.label}</span>
                <span className="text-faint">·{attachment.files.length}</span>
                <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" className="text-muted hover:text-err">
                  <CloseIcon size={10} />
                </button>
              </span>
            )}
            {uploadPct !== null && (
              <span className="inline-flex h-6 items-center gap-1.5 font-mono text-11 text-muted">
                <span className="h-1 w-20 overflow-hidden rounded bg-raised">
                  <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(uploadPct * 100)}%` }} />
                </span>
                uploading {Math.round(uploadPct * 100)}%
              </span>
            )}
          </div>
        )}

        {/* starter questions */}
        {starters.length > 0 && showStarters && !running && (
          <div className="flex flex-wrap gap-1 px-2.5 pt-2">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="h-6 max-w-full truncate rounded-card border border-edge bg-raised px-2 text-11 text-fg transition-colors hover:border-accent hover:text-accent"
                title={s}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={(el) => {
            areaRef.current = el;
            setAreaEl(el);
          }}
          value={text}
          rows={rows}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true);
            setTryOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files ?? []);
            if (files.length) {
              e.preventDefault();
              void doUpload(files);
            }
          }}
          placeholder={placeholder}
          aria-label="Ask swarn"
          aria-autocomplete="list"
          aria-controls={picker ? listId : undefined}
          aria-expanded={!!picker}
          role="combobox"
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-13 leading-relaxed text-fg placeholder:text-faint focus:outline-none disabled:opacity-60"
        />

        {/* toolbar */}
        <div className="flex items-center gap-1 px-2 pb-2">
          <IconButton label="Attach files" onClick={() => fileRef.current?.click()} disabled={busy || uploadPct !== null}>
            <PlusIcon size={16} />
          </IconButton>
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
          {starters.length > 0 && (
            <IconButton label={showStarters ? "Hide starter questions" : "Show starter questions"} active={showStarters} onClick={() => setShowStarters((s) => !s)}>
              <BoltIcon size={15} />
            </IconButton>
          )}
          <span className="flex-1" />
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              disabled={busy}
              aria-label="Generate a report"
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-12 text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 @[440px]:px-2"
              title="Ask for a report of the findings so far"
            >
              <PencilIcon size={13} />
              <span className="hidden whitespace-nowrap @[440px]:inline">Generate a report</span>
            </button>
          )}
          {onSuggest && (
            <button
              type="button"
              onClick={onSuggest}
              disabled={busy}
              aria-label="Suggest next steps"
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-12 text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 @[440px]:px-2"
              title="Ask for 3–5 next analyses"
            >
              <BulbIcon size={13} />
              <span className="hidden whitespace-nowrap @[440px]:inline">Suggest next steps</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => send()}
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className={`ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed ${
              canSend ? "bg-accent text-on-accent hover:opacity-90" : "bg-raised text-faint"
            }`}
          >
            <ArrowUpIcon size={15} />
          </button>
        </div>

        {/* working overlay */}
        {running && (
          <div className="absolute inset-0 z-[2] flex flex-col bg-panel/95" role="status" aria-live="polite">
            <div className="flex flex-1 items-center gap-3 px-3">
              <PencilIcon size={16} className="shrink-0 text-accent animate-wobble motion-reduce:animate-none" />
              <div className="min-w-0 flex-1">
                <div className="text-13 text-fg">swarn is working…</div>
                <div className="truncate font-mono text-11 text-muted">
                  {runningLabel ?? "thinking…"}
                  {elapsed && <span className="ml-2 text-faint">{elapsed}</span>}
                </div>
              </div>
              {onStop && (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop the run"
                  title="Stop"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-err text-white transition-opacity hover:opacity-90"
                >
                  <StopIcon size={14} />
                </button>
              )}
            </div>
            <ProgressBar />
          </div>
        )}
      </div>

      {/* @ dataset picker */}
      <Popover anchor={areaEl} open={!!picker && pickerItems.length > 0} onClose={() => setPicker(null)} placement="top-start" role="listbox" label="Datasets" width={280} initialFocus={false}>
        <ul id={listId} role="listbox" className="max-h-56 overflow-y-auto p-1">
          {pickerItems.map((name, i) => (
            <li key={name} role="option" aria-selected={i === pickerIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyPick(name)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-12 ${i === pickerIndex ? "bg-accent-tint text-accent" : "text-fg hover:bg-hover"}`}
              >
                <TableIcon size={12} />
                {name}
              </button>
            </li>
          ))}
        </ul>
      </Popover>

      {/* landing: try asking */}
      {tryAsking && (
        <Popover anchor={cardEl} open={tryOpen && focused && text.trim() === ""} onClose={() => setTryOpen(false)} placement="bottom-start" role="listbox" label="Try asking" width={Math.min(560, cardEl?.clientWidth ?? 560)} initialFocus={false}>
          <div className="p-1">
            <div className="px-2 py-1 text-10 font-bold tracking-[0.04em] text-faint uppercase">Try asking</div>
            {tryAsking.map((q) => (
              <button
                key={q}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setText(q);
                  setTryOpen(false);
                  areaRef.current?.focus();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 text-fg hover:bg-hover"
              >
                <DocumentIcon size={13} className="text-muted" />
                {q}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
