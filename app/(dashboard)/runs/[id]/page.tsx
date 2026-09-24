"use client";

/**
 * AIDE run detail (docs/guide.md §8.2): the journal as a solution tree in
 * thread columns (a node's children fork into columns), the report in the
 * 816px document column, and the files list.
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, runFileUrl, type RunDetail, type RunFile } from "@/lib/api";
import { formatBytes, formatMetric, isImagePath } from "@/lib/format";
import { DocumentColumn } from "@/components/document-column";
import { StaticThread } from "@/components/workspace/static-thread";
import { bestNode, journalNodes, workspaceFromJournal } from "@/components/history/solution-tree";
import { EmptyNote, ErrorNote, FileIcon, ImageIcon, Loading, SkeletonRows, Tabs, TreeIcon } from "@/components/ui";

type TabId = "tree" | "report" | "files";

function FilesList({ runId, files }: { runId: string; files: RunFile[] | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  if (files === null) return <SkeletonRows rows={4} />;
  if (files.length === 0) return <EmptyNote icon={<FileIcon size={22} />} title="No artifact files" />;
  return (
    <div className="mx-auto max-w-4xl">
      <ul className="divide-y divide-edge overflow-hidden rounded-panel border border-edge bg-panel">
        {files.map((f) => (
          <li key={f.path} className="group flex items-center gap-3 px-3 py-1.5 hover:bg-hover">
            <span className="shrink-0 text-faint" aria-hidden>
              {isImagePath(f.path) ? <ImageIcon size={14} /> : <FileIcon size={14} />}
            </span>
            <a href={runFileUrl(runId, f.path)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-12 text-accent hover:underline">
              {f.path}
            </a>
            {isImagePath(f.path) && (
              <button
                type="button"
                onClick={() => setPreview((p) => (p === f.path ? null : f.path))}
                aria-pressed={preview === f.path}
                className="reveal shrink-0 rounded-chip border border-edge px-2 py-0.5 text-10 text-muted transition-colors hover:text-fg"
              >
                {preview === f.path ? "hide" : "preview"}
              </button>
            )}
            <span className="w-16 shrink-0 text-right font-mono text-10 text-faint">{formatBytes(f.size)}</span>
          </li>
        ))}
      </ul>
      {preview && (
        <figure className="mt-3">
          {/* run artifacts are arbitrary agent-produced media — plain <img> */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={runFileUrl(runId, preview)} alt={preview} className="max-h-[480px] rounded-panel border border-edge bg-panel" />
          <figcaption className="mt-1.5 font-mono text-10 text-faint">{preview}</figcaption>
        </figure>
      )}
    </div>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [files, setFiles] = useState<RunFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("tree");

  useEffect(() => {
    let cancelled = false;
    api
      .getRun(id)
      .then((r) => {
        if (cancelled) return;
        // the legacy endpoint answers 200 with {error} for an unknown run
        if (r && typeof (r as { error?: unknown }).error === "string") setError(String((r as { error: string }).error));
        else setRun(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    api
      .listRunFiles(id)
      .then((r) => {
        if (!cancelled) setFiles(r.files);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const nodes = useMemo(() => journalNodes(run?.journal), [run]);
  const champion = useMemo(() => bestNode(nodes), [nodes]);
  const ws = useMemo(() => (run ? workspaceFromJournal(id, nodes) : null), [run, id, nodes]);

  if (error) {
    return (
      <div className="p-6">
        <ErrorNote message={error} />
        <Link href="/history?tab=runs" className="mt-3 inline-block text-12 text-accent hover:underline">
          ← Back to history
        </Link>
      </div>
    );
  }
  if (!run || !ws) return <Loading label="Loading run…" />;

  const best = champion?.metric ?? (typeof run.best_metric === "number" ? run.best_metric : null);
  const buggy = nodes.filter((n) => n.is_buggy).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-edge bg-panel px-4 pt-2.5 sm:px-5">
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1.5 text-11">
          <Link href="/history?tab=runs" className="text-muted hover:text-fg">
            History
          </Link>
          <span className="text-faint" aria-hidden>
            /
          </span>
          <span className="font-mono text-fg">{id}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TreeIcon size={15} className="text-report" />
          <h1 className="font-mono text-13 font-medium text-fg">{id}</h1>
          <span className="flex flex-wrap items-center gap-x-3 font-mono text-11 text-muted">
            <span>
              {nodes.length} node{nodes.length === 1 ? "" : "s"}
              {buggy > 0 && <span className="text-faint"> · {buggy} buggy</span>}
            </span>
            <span>
              best metric <span className="text-ok">{formatMetric(best)}</span>
              {champion && <span className="text-faint"> (#{champion.step} {champion.stage})</span>}
            </span>
          </span>
        </div>
        <div className="mt-1">
          <Tabs<TabId>
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "tree", label: "Solution tree" },
              { id: "report", label: "Report" },
              { id: "files", label: "Files" },
            ]}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "tree" &&
          (nodes.length === 0 ? (
            <EmptyNote icon={<TreeIcon size={22} />} title="No journal for this run" hint="The solution tree appears once the search has recorded at least one attempt." />
          ) : (
            <StaticThread ws={ws} />
          ))}
        {tab === "report" && (
          <div className="h-full overflow-y-auto">
            {run.report_markdown ? (
              <DocumentColumn title={`Report · ${id}`} markdown={run.report_markdown} />
            ) : (
              <EmptyNote icon={<FileIcon size={22} />} title="No report for this run" hint="AIDE writes a report once the search finishes." />
            )}
          </div>
        )}
        {tab === "files" && (
          <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
            <FilesList runId={id} files={files} />
          </div>
        )}
      </div>
    </div>
  );
}
