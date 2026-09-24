"use client";

/**
 * The one-shot run form (ReAct / AIDE / Team) — opened from Jobs in a drawer
 * ("New run"). Uploads go through the existing multipart endpoint; AIDE takes a
 * search budget and needs a dataset.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, uploadFiles, ApiError, type Method, type UploadBatch } from "@/lib/api";
import { formatBytes, formatTime } from "@/lib/format";
import { useToast } from "@/components/toast";
import { Button, Field, Input, SectionLabel, Textarea, UploadIcon } from "@/components/ui";

const METHODS: { id: Method; name: string; tagline: string; detail: string }[] = [
  {
    id: "react",
    name: "ReAct",
    tagline: "General agent",
    detail: "A single reason-and-act loop with the full tool set. Good default for analysis, scripting, and open-ended tasks.",
  },
  {
    id: "aide",
    name: "AIDE",
    tagline: "ML solution tree search",
    detail: "Searches a tree of candidate ML solutions over your dataset, keeping the best metric. Requires a dataset.",
  },
  {
    id: "team",
    name: "Team",
    tagline: "Planner → Coder → Reviewer → Tester",
    detail: "A four-role pipeline that plans, implements, reviews, and tests. Runs to completion (no mid-run cancel).",
  },
];

interface SelectedData {
  dataDir: string;
  label: string;
  files: string[];
}

export function NewRunForm({ onSubmitted, initialTask = "" }: { onSubmitted: (jobId: string) => void; initialTask?: string }) {
  const toast = useToast();

  const [task, setTask] = useState(initialTask);
  const [method, setMethod] = useState<Method>("react");
  const [steps, setSteps] = useState(10);
  const [data, setData] = useState<SelectedData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploads, setUploads] = useState<UploadBatch[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const refreshUploads = useCallback(() => {
    api
      .listUploads()
      .then((r) => setUploads(r.uploads))
      .catch(() => setUploads([]));
  }, []);

  useEffect(() => {
    refreshUploads();
  }, [refreshUploads]);

  const doUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploadPct(0);
      try {
        const res = await uploadFiles(files, setUploadPct);
        setData({ dataDir: res.data_dir, label: res.relative_dir, files: res.files });
        toast("success", `Uploaded ${res.files.length} file(s)`);
        refreshUploads();
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploadPct(null);
      }
    },
    [toast, refreshUploads],
  );

  const aideMissingData = method === "aide" && !data;
  const canSubmit = task.trim().length > 0 && !aideMissingData && !submitting && uploadPct === null;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const job = await api.createJob({
        task: task.trim(),
        method,
        data_dir: data?.dataDir || undefined,
        steps: method === "aide" ? steps : undefined,
      });
      onSubmitted(job.id);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Failed to submit the job");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <Field label="Task" htmlFor="task">
          <Textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            placeholder="e.g. Predict movie ratings from the attached dataset; report RMSE."
            className="resize-y font-sans"
          />
        </Field>
      </section>

      <section>
        <SectionLabel className="mb-1.5">Method</SectionLabel>
        <div className="grid gap-2 sm:grid-cols-3">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              aria-pressed={method === m.id}
              className={`rounded-panel border p-3 text-left transition-colors ${
                method === m.id ? "border-accent bg-accent-tint" : "border-edge bg-panel hover:border-faint"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-13 font-semibold text-fg">{m.name}</span>
                <span className={`h-3 w-3 rounded-full border ${method === m.id ? "border-accent bg-accent" : "border-edge"}`} />
              </div>
              <div className="mt-0.5 font-mono text-10 text-accent">{m.tagline}</div>
              <p className="mt-1 text-11 leading-relaxed text-muted">{m.detail}</p>
            </button>
          ))}
        </div>
      </section>

      {method === "aide" && (
        <section>
          <Field label="Search budget (nodes)" htmlFor="steps" hint="How many solution nodes AIDE may explore." className="max-w-[10rem]">
            <Input
              id="steps"
              type="number"
              min={1}
              max={500}
              value={steps}
              onChange={(e) => setSteps(Math.max(1, Number(e.target.value) || 1))}
              className="font-mono"
            />
          </Field>
        </section>
      )}

      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <SectionLabel>
            Data{" "}
            {method === "aide" ? <span className="text-err">(required for AIDE)</span> : <span className="font-normal text-faint">(optional)</span>}
          </SectionLabel>
          <button type="button" onClick={() => setShowPicker((s) => !s)} className="text-11 text-accent hover:underline">
            {showPicker ? "Hide previous uploads" : "Reuse an upload"}
          </button>
        </div>

        {data ? (
          <div className="flex items-center justify-between rounded-panel border border-ok/40 bg-ok-tint px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate font-mono text-12 text-fg">{data.label}</div>
              <div className="mt-0.5 truncate text-11 text-muted">
                {data.files.length} file(s): {data.files.slice(0, 5).join(", ")}
                {data.files.length > 5 && "…"}
              </div>
            </div>
            <Button size="sm" onClick={() => setData(null)}>
              Clear
            </Button>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void doUpload(Array.from(e.dataTransfer.files));
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`cursor-pointer rounded-panel border border-dashed px-4 py-6 text-center transition-colors ${
              dragOver ? "border-accent bg-accent-tint" : "border-edge bg-panel hover:border-faint"
            }`}
          >
            {uploadPct !== null ? (
              <div className="mx-auto max-w-xs">
                <div className="mb-2 text-12 text-muted">Uploading… {Math.round(uploadPct * 100)}%</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round(uploadPct * 100)}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div className="mb-1.5 flex justify-center text-faint">
                  <UploadIcon size={20} />
                </div>
                <div className="text-12 text-muted">Drop files here, or click to browse</div>
                <div className="mt-0.5 text-11 text-faint">Files are stored in the agent workspace under uploads/</div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void doUpload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>
        )}

        {showPicker && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-panel border border-edge bg-panel">
            {uploads === null ? (
              <div className="px-3 py-2 text-12 text-muted">Loading…</div>
            ) : uploads.length === 0 ? (
              <div className="px-3 py-2 text-12 text-muted">No previous uploads.</div>
            ) : (
              uploads.map((u) => (
                <button
                  key={u.batch}
                  type="button"
                  onClick={() => {
                    setData({ dataDir: u.data_dir, label: u.relative_dir, files: u.files.map((f) => f.name) });
                    setShowPicker(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-edge px-3 py-2 text-left last:border-b-0 hover:bg-hover"
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-11 text-fg">{u.relative_dir}</div>
                    <div className="mt-0.5 truncate text-11 text-muted">
                      {u.files.map((f) => f.name).slice(0, 4).join(", ")}
                      {u.files.length > 4 && "…"} · {formatBytes(u.files.reduce((s, f) => s + f.size, 0))}
                    </div>
                  </div>
                  <span className="shrink-0 text-10 text-faint">{formatTime(u.created)}</span>
                </button>
              ))
            )}
          </div>
        )}

        {aideMissingData && <p className="mt-2 text-11 text-err">AIDE needs a dataset — upload files or pick a previous upload.</p>}
      </section>

      <div className="flex items-center gap-3 border-t border-edge pt-4">
        <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={submitting}>
          {submitting ? "Submitting…" : "Start run"}
        </Button>
        <span className="text-11 text-faint">Runs execute on the backend; you&apos;ll be taken to the live view.</span>
      </div>
    </div>
  );
}
