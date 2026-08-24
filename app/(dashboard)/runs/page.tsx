"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type RunSummary } from "@/lib/api";
import { formatMetric } from "@/lib/format";
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/ui";

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRuns(100)
      .then((r) => setRuns(r.runs))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Runs"
        subtitle="AIDE solution-search runs with their reports and artifacts."
      />

      {error && <ErrorNote message={error} />}
      {runs === null && !error && <Spinner label="Loading runs…" />}
      {runs !== null && runs.length === 0 && (
        <EmptyState
          title="No AIDE runs yet"
          hint="Start a run with the AIDE method to see solution searches here."
        />
      )}

      {runs !== null && runs.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-edge">
          {runs.map((r) => (
            <Link
              key={r.run_id}
              href={`/runs/${r.run_id}`}
              className="flex items-center gap-4 border-b border-edge bg-panel px-4 py-3 last:border-b-0 hover:bg-hover"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">
                {r.run_id}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted">
                {r.nodes ?? "—"} nodes
              </span>
              <span className="shrink-0 font-mono text-xs text-ok">
                best {formatMetric(r.best_metric)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
