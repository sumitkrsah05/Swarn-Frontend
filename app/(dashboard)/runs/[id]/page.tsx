"use client";

import { use, useEffect, useState } from "react";
import {
  api,
  runFileUrl,
  type RunDetail,
  type RunFile,
  type RunNode,
} from "@/lib/api";
import { formatBytes, formatMetric, isImagePath } from "@/lib/format";
import { Markdown } from "@/components/markdown";
import { ErrorNote, PageHeader, Spinner } from "@/components/ui";

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [files, setFiles] = useState<RunFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRun(id)
      .then(setRun)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api
      .listRunFiles(id)
      .then((r) => setFiles(r.files))
      .catch(() => setFiles([]));
  }, [id]);

  if (error) return <ErrorNote message={error} />;
  if (!run) return <Spinner label="Loading run…" />;

  const journal: RunNode[] = Array.isArray(run.journal) ? run.journal : [];

  return (
    <div>
      <PageHeader
        title={<span className="font-mono text-base">{id}</span>}
        subtitle={
          <span className="font-mono text-xs">
            {journal.length > 0 && `${journal.length} nodes · `}
            best metric{" "}
            <span className="text-ok">{formatMetric(run.best_metric)}</span>
          </span>
        }
      />

      {/* artifacts */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-fg">Artifacts</h2>
        {files === null ? (
          <Spinner label="Loading files…" />
        ) : files.length === 0 ? (
          <p className="text-sm text-muted">No artifact files.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-edge">
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-3 border-b border-edge bg-panel px-3 py-2 last:border-b-0"
              >
                <a
                  href={runFileUrl(id, f.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate font-mono text-xs text-accent hover:underline"
                >
                  {f.path}
                </a>
                {isImagePath(f.path) && (
                  <button
                    onClick={() =>
                      setPreview((p) => (p === f.path ? null : f.path))
                    }
                    className="shrink-0 rounded border border-edge px-2 py-0.5 text-[11px] text-muted hover:text-fg"
                  >
                    {preview === f.path ? "hide" : "preview"}
                  </button>
                )}
                <span className="w-20 shrink-0 text-right font-mono text-[11px] text-faint">
                  {formatBytes(f.size)}
                </span>
              </div>
            ))}
          </div>
        )}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={runFileUrl(id, preview)}
            alt={preview}
            className="mt-3 max-h-[480px] rounded-lg border border-edge bg-panel"
          />
        )}
      </section>

      {/* report */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-fg">Report</h2>
        {run.report_markdown ? (
          <div className="rounded-lg border border-edge bg-panel p-5">
            <Markdown>{run.report_markdown}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted">No report for this run.</p>
        )}
      </section>
    </div>
  );
}
