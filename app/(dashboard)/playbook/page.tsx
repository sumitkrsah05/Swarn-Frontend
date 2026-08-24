"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Markdown } from "@/components/markdown";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/ui";

export default function PlaybookPage() {
  const [playbook, setPlaybook] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPlaybook()
      .then((r) => setPlaybook(r.playbook ?? ""))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Playbook"
        subtitle="Lessons the agent has learned across past runs."
      />
      {error && <ErrorNote message={error} />}
      {playbook === null && !error && <Spinner label="Loading playbook…" />}
      {playbook !== null &&
        (playbook.trim() === "" ? (
          <EmptyState
            title="The playbook is empty"
            hint="It fills in as runs complete and lessons are extracted."
          />
        ) : (
          <div className="rounded-lg border border-edge bg-panel p-5">
            <Markdown>{playbook}</Markdown>
          </div>
        ))}
    </div>
  );
}
