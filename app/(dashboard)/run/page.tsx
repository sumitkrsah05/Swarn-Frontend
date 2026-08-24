"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  uploadFiles,
  ApiError,
  type Method,
  type UploadBatch,
} from "@/lib/api";
import { formatBytes, formatTime } from "@/lib/format";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/ui";

const METHODS: {
  id: Method;
  name: string;
  tagline: string;
  detail: string;
}[] = [
  {
    id: "react",
    name: "ReAct",
    tagline: "General agent",
    detail:
      "A single reason-and-act loop with the full tool set. Good default for analysis, scripting, and open-ended tasks.",
  },
  {
    id: "aide",
    name: "AIDE",
    tagline: "ML solution tree search",
    detail:
      "Searches a tree of candidate ML solutions over your dataset, keeping the best metric. Requires a dataset.",
  },
  {
    id: "team",
    name: "Team",
    tagline: "Planner → Coder → Reviewer → Tester",
    detail:
      "A four-role pipeline that plans, implements, reviews, and tests. Runs to completion (no mid-run cancel).",
  },
];

interface SelectedData {
  dataDir: string;
  label: string;
  files: string[];
}

export default function NewRunPage() {
  const router = useRouter();
  const toast = useToast();

  const [task, setTask] = useState("");
  const [method, setMethod] = useState<Method>("react");
  const [steps, setSteps] = useState(10);
  const [data, setData] = useState<SelectedData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // upload state
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // previous uploads
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
        setData({
          dataDir: res.data_dir,
          label: res.relative_dir,
          files: res.files,
        });
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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      doUpload(Array.from(e.dataTransfer.files));
    },
    [doUpload],
  );

  const aideMissingData = method === "aide" && !data;
  const canSubmit =
    task.trim().length > 0 && !aideMissingData && !submitting && uploadPct === null;

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
      router.push(`/jobs/${job.id}`);
    } catch (e) {
      toast(
        "error",
        e instanceof ApiError ? e.message : "Failed to submit the job",
      );
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New Run"
        subtitle="One-shot advanced run (ReAct / AIDE / Team). For a conversation, use Chat."
      />

      <div className="space-y-6">
        {/* task */}
        <section>
          <label
            htmlFor="task"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
          >
            Task
          </label>
          <textarea
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            placeholder="e.g. Predict movie ratings from the attached dataset; report RMSE."
            className="w-full resize-y rounded-lg border border-edge bg-panel px-3 py-2.5 font-mono text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </section>

        {/* method */}
        <section>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Method
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={`rounded-lg border p-3.5 text-left transition-colors ${
                  method === m.id
                    ? "border-accent bg-accent/5"
                    : "border-edge bg-panel hover:border-faint"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-fg">{m.name}</span>
                  <span
                    className={`h-3.5 w-3.5 rounded-full border ${
                      method === m.id
                        ? "border-accent bg-accent"
                        : "border-edge"
                    }`}
                  />
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-accent/80">
                  {m.tagline}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {m.detail}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* aide steps */}
        {method === "aide" && (
          <section>
            <label
              htmlFor="steps"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
            >
              Search budget (nodes)
            </label>
            <input
              id="steps"
              type="number"
              min={1}
              max={500}
              value={steps}
              onChange={(e) => setSteps(Math.max(1, Number(e.target.value) || 1))}
              className="w-32 rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-sm text-fg focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-faint">
              How many solution nodes AIDE may explore.
            </p>
          </section>
        )}

        {/* data */}
        <section>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Data{" "}
              {method === "aide" ? (
                <span className="text-err">(required for AIDE)</span>
              ) : (
                <span className="text-faint normal-case">(optional)</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowPicker((s) => !s)}
              className="text-xs text-accent hover:underline"
            >
              {showPicker ? "Hide previous uploads" : "Choose a previous upload"}
            </button>
          </div>

          {data ? (
            <div className="flex items-center justify-between rounded-lg border border-ok/40 bg-ok/5 px-4 py-3">
              <div>
                <div className="font-mono text-sm text-fg">{data.label}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {data.files.length} file(s): {data.files.slice(0, 5).join(", ")}
                  {data.files.length > 5 && "…"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setData(null)}
                className="rounded-md border border-edge px-2.5 py-1 text-xs text-muted hover:text-fg"
              >
                Clear
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${
                dragOver
                  ? "border-accent bg-accent/5"
                  : "border-edge bg-panel hover:border-faint"
              }`}
            >
              {uploadPct !== null ? (
                <div className="mx-auto max-w-xs">
                  <div className="mb-2 text-sm text-muted">
                    Uploading… {Math.round(uploadPct * 100)}%
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${Math.round(uploadPct * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm text-muted">
                    Drop files here, or click to browse
                  </div>
                  <div className="mt-1 text-xs text-faint">
                    Files are stored in the agent workspace under uploads/
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  doUpload(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {showPicker && (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-edge bg-panel">
              {uploads === null ? (
                <div className="px-4 py-3 text-sm text-muted">Loading…</div>
              ) : uploads.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted">
                  No previous uploads.
                </div>
              ) : (
                uploads.map((u) => (
                  <button
                    key={u.batch}
                    type="button"
                    onClick={() => {
                      setData({
                        dataDir: u.data_dir,
                        label: u.relative_dir,
                        files: u.files.map((f) => f.name),
                      });
                      setShowPicker(false);
                    }}
                    className="flex w-full items-center justify-between border-b border-edge px-4 py-2.5 text-left last:border-b-0 hover:bg-hover"
                  >
                    <div>
                      <div className="font-mono text-xs text-fg">
                        {u.relative_dir}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {u.files.map((f) => f.name).slice(0, 4).join(", ")}
                        {u.files.length > 4 && "…"} ·{" "}
                        {formatBytes(u.files.reduce((s, f) => s + f.size, 0))}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-faint">
                      {formatTime(u.created)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {aideMissingData && (
            <p className="mt-2 text-xs text-err">
              AIDE needs a dataset — upload files or pick a previous upload.
            </p>
          )}
        </section>

        {/* submit */}
        <div className="flex items-center gap-3 border-t border-edge pt-5">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Start run"}
          </button>
          <span className="text-xs text-faint">
            Runs execute on the backend; you&apos;ll be taken to the live view.
          </span>
        </div>
      </div>
    </div>
  );
}
