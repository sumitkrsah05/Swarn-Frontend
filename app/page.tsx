"use client";

/**
 * The Workspace (docs/guide.md §7). With no active workspace it shows the
 * Landing; otherwise the analysis workspace: rail · thread pane · canvas.
 */

import { useActiveWorkspace, useWorkspacesLoaded } from "@/lib/workspace-store";
import { Landing } from "@/components/workspace/landing";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { Loading } from "@/components/ui";

export default function WorkspacePage() {
  const loaded = useWorkspacesLoaded();
  const active = useActiveWorkspace();
  if (!loaded) return <Loading label="Loading workspaces…" />;
  return active ? <WorkspaceView ws={active} /> : <Landing />;
}
