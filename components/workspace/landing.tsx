"use client";

/**
 * The landing page (docs/guide.md §7.1): graph-paper background, the mark and
 * wordmark, the big composer with "Try asking", "Or add data directly",
 * RECENT WORKSPACES and EXAMPLES. Sending creates a workspace and its first turn.
 */

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, uploadFiles, workspaceFileUrl, type UploadBatch } from "@/lib/api";
import { formatBytes, formatTime, timeAgo } from "@/lib/format";
import { EXAMPLES, TRY_ASKING } from "@/lib/starters";
import { chartCount, latestChartPath, threadCount, type ChatAttachment, type Workspace } from "@/lib/workspace";
import { useWorkspaceActions, useWorkspaces } from "@/lib/workspace-store";
import { useRunner } from "@/hooks/useWorkspaceRunner";
import { useToast } from "@/components/toast";
import { Composer, type ComposerSubmit } from "./composer";
import { downloadText } from "./workspaces-dialog";
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  IconButton,
  ImportIcon,
  Input,
  PencilIcon,
  Popover,
  SectionLabel,
  SwarnMark,
  TableIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/ui";

function WorkspaceCard({ ws, onOpen }: { ws: Workspace; onOpen: () => void }) {
  const actions = useWorkspaceActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ws.name);
  const [armed, setArmed] = useState(false);
  const cover = latestChartPath(ws);
  return (
    <div className="group relative flex h-[88px] overflow-hidden rounded-panel border border-edge bg-panel lift-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-stretch text-left">
        <span className="flex w-[72px] shrink-0 items-center justify-center border-r border-edge bg-raised text-faint">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspaceFileUrl(cover)} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <TableIcon size={22} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center px-3">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                actions.rename(ws.id, name);
                setEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Workspace name" className="h-7 py-0 text-13" onBlur={() => setEditing(false)} />
            </form>
          ) : (
            <span className="truncate text-13 font-medium text-fg">{ws.name}</span>
          )}
          <span className="mt-0.5 truncate text-11 text-muted">{timeAgo(ws.updatedAt)}</span>
          <span className="truncate font-mono text-10 text-faint">
            {threadCount(ws)} thread{threadCount(ws) === 1 ? "" : "s"} · {chartCount(ws)} chart{chartCount(ws) === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      <div className="absolute top-1.5 right-1.5">
        {armed ? (
          <span className="flex items-center gap-0.5 rounded-canvas border border-err/40 bg-panel p-0.5 text-11 text-err shadow-hair">
            delete?
            <IconButton label="Confirm delete" size={22} tone="danger" onClick={() => actions.remove(ws.id)}>
              <CheckIcon size={12} />
            </IconButton>
            <IconButton label="Keep" size={22} onClick={() => setArmed(false)}>
              <CloseIcon size={12} />
            </IconButton>
          </span>
        ) : (
          <span className="reveal flex items-center gap-0.5 rounded-canvas border border-edge bg-panel p-0.5 shadow-hair">
            <IconButton label="Rename" size={22} onClick={() => setEditing(true)}>
              <PencilIcon size={12} />
            </IconButton>
            <IconButton
              label="Export JSON"
              size={22}
              onClick={() => {
                const text = actions.exportJson(ws.id);
                if (text) downloadText(`${ws.name.replace(/[^\w.-]+/g, "_") || "workspace"}.json`, text);
              }}
            >
              <DownloadIcon size={12} />
            </IconButton>
            <IconButton label="Delete" size={22} tone="danger" onClick={() => setArmed(true)}>
              <TrashIcon size={12} />
            </IconButton>
          </span>
        )}
      </div>
    </div>
  );
}

export function Landing() {
  const workspaces = useWorkspaces();
  const actions = useWorkspaceActions();
  const runner = useRunner();
  const toast = useToast();
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const [attach, setAttach] = useState<{ attachment: ChatAttachment; nonce: number } | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [reuseAnchor, setReuseAnchor] = useState<HTMLElement | null>(null);
  const [reuseOpen, setReuseOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const nonce = useRef(0);
  const uploads = useQuery({ queryKey: ["uploads"], queryFn: api.listUploads, enabled: reuseOpen, staleTime: 15_000 });
  const recent = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);

  const send = (s: ComposerSubmit) => {
    const ws = actions.create(s.text);
    runner.ask(ws.id, { prompt: s.text, parentId: null, attachment: s.attachment ?? undefined, mentions: s.mentions });
  };

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setPct(0);
    try {
      const res = await uploadFiles(files, setPct);
      nonce.current += 1;
      setAttach({ attachment: { data_dir: res.data_dir, label: res.relative_dir, files: res.files }, nonce: nonce.current });
      toast("success", `Uploaded ${res.files.length} file(s) — describe what to do with them`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="graph-paper h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1024px] px-4 pb-16 sm:px-6">
        <section className="flex flex-col items-center justify-center text-center" style={{ minHeight: "calc(100vh - 150px)" }}>
          <div className="mb-3 flex items-center gap-3 text-accent">
            <SwarnMark size={52} />
            <span className="wordmark text-[56px] leading-none text-fg">swarn</span>
          </div>
          <p className="mb-6 text-14 text-muted">Analyse data with an agent that shows its work.</p>
          <div className="flex w-full justify-center">
            <Composer
              variant="big"
              onSend={send}
              placeholder="Drop a CSV / Excel / Parquet file, or ask swarn to analyse something…"
              tryAsking={TRY_ASKING}
              prefill={prefill}
              attachRequest={attach}
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-12 text-muted">
            <span>Or add data directly:</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pct !== null}
              className="inline-flex h-7 items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2.5 text-12 text-fg shadow-hair hover:border-accent hover:text-accent disabled:opacity-50"
            >
              <UploadIcon size={13} />
              {pct === null ? "Upload files" : `Uploading ${Math.round(pct * 100)}%`}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              ref={setReuseAnchor}
              onClick={() => setReuseOpen((o) => !o)}
              className="inline-flex h-7 items-center gap-1.5 rounded-canvas border border-edge bg-panel px-2.5 text-12 text-fg shadow-hair hover:border-accent hover:text-accent"
              aria-haspopup="dialog"
              aria-expanded={reuseOpen}
            >
              <TableIcon size={13} />
              Reuse an upload
            </button>
            <Popover anchor={reuseAnchor} open={reuseOpen} onClose={() => setReuseOpen(false)} placement="bottom-start" width={340} label="Previous uploads">
              <div className="max-h-72 overflow-y-auto p-1">
                {uploads.isPending && <p className="px-2 py-2 text-11 text-muted">Loading…</p>}
                {uploads.isError && <p className="px-2 py-2 text-11 text-err">{(uploads.error as Error).message}</p>}
                {uploads.data?.uploads.length === 0 && <p className="px-2 py-2 text-11 text-muted">No previous uploads.</p>}
                {(uploads.data?.uploads ?? []).map((u: UploadBatch) => (
                  <button
                    key={u.batch}
                    type="button"
                    onClick={() => {
                      nonce.current += 1;
                      setAttach({ attachment: { data_dir: u.data_dir, label: u.relative_dir, files: u.files.map((f) => f.name) }, nonce: nonce.current });
                      setReuseOpen(false);
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
                  >
                    <div className="truncate font-mono text-11 text-fg">{u.files.map((f) => f.name).join(", ")}</div>
                    <div className="text-10 text-faint">
                      {formatTime(u.created)} · {formatBytes(u.files.reduce((s, f) => s + f.size, 0))}
                    </div>
                  </button>
                ))}
              </div>
            </Popover>
          </div>
        </section>

        <section className="mt-2">
          <SectionLabel className="mb-3">Recent workspaces</SectionLabel>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {recent.map((ws) => (
              <WorkspaceCard key={ws.id} ws={ws} onOpen={() => actions.setActive(ws.id)} />
            ))}
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex h-[88px] items-center justify-center gap-2 rounded-panel border border-dashed border-edge text-12 text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <ImportIcon size={16} />
              Import workspace (.json)
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const ws = actions.importJson(await f.text());
                if (ws) toast("success", `Imported "${ws.name}"`);
                else toast("error", "That file is not a swarn workspace export.");
              }}
            />
          </div>
        </section>

        <section className="mt-8">
          <SectionLabel className="mb-3">Examples</SectionLabel>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.title}
                type="button"
                onClick={() => {
                  nonce.current += 1;
                  setPrefill({ text: ex.prompt, nonce: nonce.current });
                  window.scrollTo({ top: 0 });
                }}
                className="rounded-panel border border-edge bg-panel p-3 text-left lift-2"
              >
                <div className="text-13 font-medium text-fg">{ex.title}</div>
                <div className="mt-1 clamp-2 text-11 text-muted">{ex.prompt}</div>
                <div className="mt-1.5 font-mono text-10 text-faint">{ex.hint}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
