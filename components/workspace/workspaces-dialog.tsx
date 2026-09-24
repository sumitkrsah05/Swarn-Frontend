"use client";

/**
 * The "Workspaces" dialog (docs/guide.md §6.1): New · rename inline · delete
 * with inline confirmation · list sorted by last modified.
 */

import { useEffect, useRef, useState } from "react";
import { useWorkspaceActions, useWorkspaces, useWorkspaceSelector } from "@/lib/workspace-store";
import { activeTurn, chartCount, threadCount, type Workspace } from "@/lib/workspace";
import { timeAgo } from "@/lib/format";
import {
  Button,
  CheckIcon,
  CloseIcon,
  Dialog,
  DotIcon,
  DownloadIcon,
  IconButton,
  Input,
  PencilIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/ui";

export function downloadText(name: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WorkspaceRow({
  ws,
  active,
  onOpen,
  compact,
}: {
  ws: Workspace;
  active: boolean;
  onOpen: () => void;
  compact?: boolean;
}) {
  const actions = useWorkspaceActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ws.name);
  const [armed, setArmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const running = !!activeTurn(ws);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    actions.rename(ws.id, name);
    setEditing(false);
  };

  return (
    <li className="group flex items-center gap-2 rounded-panel px-2 py-1.5 hover:bg-hover">
      <span className={`shrink-0 ${active ? "text-accent" : "text-transparent"}`} aria-hidden>
        <DotIcon size={10} />
      </span>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setName(ws.name);
                setEditing(false);
              }
            }}
            aria-label="Workspace name"
            className="h-7 py-0 text-13"
          />
          <IconButton label="Save name" size={24} type="submit" tone="primary">
            <CheckIcon size={13} />
          </IconButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          aria-current={active ? "true" : undefined}
        >
          <span className={`block truncate text-13 ${active ? "font-medium text-fg" : "text-fg"}`}>{ws.name}</span>
          {!compact && (
            <span className="block truncate font-mono text-10 text-faint">
              {timeAgo(ws.updatedAt)} · {threadCount(ws)} thread{threadCount(ws) === 1 ? "" : "s"} · {chartCount(ws)} chart
              {chartCount(ws) === 1 ? "" : "s"}
            </span>
          )}
          {compact && <span className="block font-mono text-10 text-faint">{timeAgo(ws.updatedAt)}</span>}
        </button>
      )}
      {running && <SpinnerIcon size={13} className="shrink-0 text-accent" title="a run is in progress" />}
      {armed ? (
        <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-edge bg-panel p-0.5">
          <IconButton
            label={`Confirm deleting "${ws.name}"`}
            size={22}
            tone="danger"
            onClick={() => {
              setArmed(false);
              actions.remove(ws.id);
            }}
          >
            <CheckIcon size={12} />
          </IconButton>
          <IconButton label="Keep this workspace" size={22} onClick={() => setArmed(false)}>
            <CloseIcon size={12} />
          </IconButton>
        </span>
      ) : (
        <span className="reveal flex shrink-0 items-center gap-0.5">
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
    </li>
  );
}

export function WorkspacesList({ compact, onOpen }: { compact?: boolean; onOpen?: () => void }) {
  const workspaces = useWorkspaces();
  const activeId = useWorkspaceSelector((s) => s.activeId);
  const actions = useWorkspaceActions();
  const sorted = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          actions.create();
          onOpen?.();
        }}
      >
        <PlusIcon size={13} />
        New workspace
      </Button>
      {sorted.length === 0 ? (
        <p className="px-2 py-4 text-12 text-muted">No workspaces yet. Ask a question on the landing page to start one.</p>
      ) : (
        <ul className="space-y-0.5">
          {sorted.map((ws) => (
            <WorkspaceRow
              key={ws.id}
              ws={ws}
              active={ws.id === activeId}
              compact={compact}
              onOpen={() => {
                actions.setActive(ws.id);
                onOpen?.();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function WorkspacesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Workspaces" width="min(30rem, 92vw)">
      <WorkspacesList onOpen={onClose} />
    </Dialog>
  );
}
