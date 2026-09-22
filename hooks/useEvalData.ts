"use client";

/**
 * React Query hooks over api/client.ts for the eval screens. Components use
 * these (or useMutation with the client functions) — never fetch directly.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as client from "@/api/client";
import type { ResultsQuery } from "@/api/types";

export const evalKeys = {
  runs: ["eval", "runs"] as const,
  run: (id: string) => ["eval", "run", id] as const,
  results: (id: string, q: ResultsQuery) => ["eval", "results", id, q] as const,
  files: (id: string) => ["eval", "files", id] as const,
  datasets: ["eval", "datasets"] as const,
  endpoints: ["eval", "endpoints"] as const,
  metrics: ["eval", "metrics"] as const,
  example: ["eval", "example"] as const,
  report: (id: string, format: "html" | "md") =>
    ["eval", "report", id, format] as const,
};

/** Runs list; polls every 5 s while any listed run has a live job. */
export function useRunsList(limit = 50) {
  return useQuery({
    queryKey: [...evalKeys.runs, limit],
    queryFn: () => client.listRuns(limit),
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      const live = runs.some(
        (r) => r.job && (r.job.status === "running" || r.job.status === "queued"),
      );
      return live ? 5000 : false;
    },
  });
}

export function useRun(runId: string | null, opts: { live?: boolean } = {}) {
  return useQuery({
    queryKey: evalKeys.run(runId ?? ""),
    queryFn: () => client.getRun(runId as string),
    enabled: !!runId,
    refetchInterval: opts.live ? 5000 : false,
  });
}

export function useResults(runId: string | null, q: ResultsQuery) {
  return useQuery({
    queryKey: evalKeys.results(runId ?? "", q),
    queryFn: () => client.getResults(runId as string, q),
    enabled: !!runId,
    placeholderData: (prev) => prev,
  });
}

export function useRunFiles(runId: string | null) {
  return useQuery({
    queryKey: evalKeys.files(runId ?? ""),
    queryFn: () => client.listRunFiles(runId as string),
    enabled: !!runId,
  });
}

export function useDatasets() {
  return useQuery({ queryKey: evalKeys.datasets, queryFn: () => client.listDatasets(200) });
}

export function useEndpoints() {
  return useQuery({ queryKey: evalKeys.endpoints, queryFn: client.getEndpoints });
}

export function useMetricsCatalog() {
  return useQuery({
    queryKey: evalKeys.metrics,
    queryFn: client.listMetrics,
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateRuns() {
  const qc = useQueryClient();
  return (runId?: string) => {
    void qc.invalidateQueries({ queryKey: evalKeys.runs });
    if (runId) void qc.invalidateQueries({ queryKey: evalKeys.run(runId) });
  };
}
