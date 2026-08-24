"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, workspaceFileUrl, type WorkspaceListing } from "@/lib/api";
import { formatBytes, isImagePath } from "@/lib/format";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/ui";

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

function Breadcrumbs({ path }: { path: string }) {
  const parts = path ? path.split("/") : [];
  const crumbs = parts.map((p, i) => ({
    name: p,
    path: parts.slice(0, i + 1).join("/"),
  }));
  return (
    <nav className="flex flex-wrap items-center gap-1 font-mono text-xs">
      <Link href="/workspace" className="text-accent hover:underline">
        workspace
      </Link>
      {crumbs.map((c) => (
        <span key={c.path} className="flex items-center gap-1">
          <span className="text-faint">/</span>
          <Link
            href={`/workspace?path=${encodeURIComponent(c.path)}`}
            className="text-accent hover:underline"
          >
            {c.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}

function WorkspaceBrowser() {
  const path = useSearchParams().get("path") ?? "";
  const [listing, setListing] = useState<WorkspaceListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    setListing(null);
    setError(null);
    setPreview(null);
    api
      .listWorkspace(path)
      .then(setListing)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [path]);

  const entries = listing
    ? [...listing.entries].sort((a, b) =>
        a.is_dir === b.is_dir
          ? a.name.localeCompare(b.name)
          : a.is_dir
            ? -1
            : 1,
      )
    : [];

  return (
    <div>
      <PageHeader
        title="Workspace"
        subtitle="Files produced by the agents. Click a file to download, images preview inline."
      />
      <div className="mb-4">
        <Breadcrumbs path={path} />
      </div>

      {error && <ErrorNote message={error} />}
      {!listing && !error && <Spinner label="Reading directory…" />}
      {listing && entries.length === 0 && (
        <EmptyState title="Empty directory" />
      )}

      {listing && entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-edge">
          {entries.map((e) => {
            const full = joinPath(path, e.name);
            return (
              <div
                key={e.name}
                className="flex items-center gap-3 border-b border-edge bg-panel px-3 py-2 last:border-b-0 hover:bg-hover"
              >
                <span className="w-5 text-center font-mono text-xs text-faint">
                  {e.is_dir ? "▸" : "·"}
                </span>
                {e.is_dir ? (
                  <Link
                    href={`/workspace?path=${encodeURIComponent(full)}`}
                    className="min-w-0 flex-1 truncate font-mono text-sm text-fg hover:text-accent"
                  >
                    {e.name}/
                  </Link>
                ) : (
                  <a
                    href={workspaceFileUrl(full)}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate font-mono text-sm text-accent hover:underline"
                  >
                    {e.name}
                  </a>
                )}
                {!e.is_dir && isImagePath(e.name) && (
                  <button
                    onClick={() => setPreview((p) => (p === full ? null : full))}
                    className="shrink-0 rounded border border-edge px-2 py-0.5 text-[11px] text-muted hover:text-fg"
                  >
                    {preview === full ? "hide" : "preview"}
                  </button>
                )}
                <span className="w-20 shrink-0 text-right font-mono text-[11px] text-faint">
                  {e.is_dir ? "" : formatBytes(e.size)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={workspaceFileUrl(preview)}
          alt={preview}
          className="mt-4 max-h-[520px] rounded-lg border border-edge bg-panel"
        />
      )}
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<Spinner label="Loading workspace…" />}>
      <WorkspaceBrowser />
    </Suspense>
  );
}
