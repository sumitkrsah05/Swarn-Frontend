/**
 * Thin client for the swarn LLM-evaluation endpoints (docs/eval_guide.md §3).
 * One function per endpoint; no component performs its own fetch. Shares the
 * API base and ApiError class with the rest of the dashboard (lib/api.ts), so
 * `{"detail": "..."}` bodies surface verbatim as `error.message`.
 */

import { API_BASE, ApiError, uploadFiles, type UploadResult } from "@/lib/api";
import type {
  CalibrateRequest,
  CalibrateResponse,
  CompareRequest,
  CompareResponse,
  ConfigBody,
  DatasetsResponse,
  DeleteResponse,
  DesignRequest,
  DesignResponse,
  EndpointsResponse,
  EstimateResponse,
  FilesResponse,
  JobDetail,
  JobSummary,
  MetricsResponse,
  PingResponse,
  RebuildReportResponse,
  ResultsQuery,
  ResultsResponse,
  ResumeRequest,
  RunDetail,
  RunRequest,
  RunsResponse,
  ValidateResponse,
} from "./types";

export { API_BASE, ApiError };

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach the API at ${API_BASE} — is the swarn server running?`,
    );
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
      else if (body?.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await doFetch(path);
  return res.json() as Promise<T>;
}

async function getText(path: string): Promise<string> {
  const res = await doFetch(path);
  return res.text();
}

async function send<T>(
  method: "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await doFetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

function qs(params: Record<string, string | number | boolean | undefined>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${enc(k)}=${enc(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ------------------------------------------------------------ §3.1 form data

export function listDatasets(limit = 200) {
  return getJson<DatasetsResponse>(`/api/eval/datasets${qs({ limit })}`);
}

export function getEndpoints() {
  return getJson<EndpointsResponse>("/api/eval/endpoints");
}

export function listMetrics() {
  return getJson<MetricsResponse>("/api/eval/metrics");
}

/** The fully commented reference eval.yaml (text/yaml). */
export function getExampleYaml() {
  return getText("/api/eval/example");
}

/**
 * Upload a dataset file into the workspace via the dashboard's existing
 * multipart `POST /api/upload` (lib/api.ts). The returned `relative_dir` is
 * workspace-relative; `<relative_dir>/<file name>` then shows up in
 * listDatasets() and is the value for `dataset.path`.
 */
export function uploadDataset(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  return uploadFiles([file], onProgress);
}

// ------------------------------------------------------- §3.3 design/checks

/** One LLM call; may take 5–30 s. 422 = dataset unusable, 404 = missing. */
export function designConfig(body: DesignRequest) {
  return send<DesignResponse>("POST", "/api/eval/design", body);
}

/** Always 200 — inspect `ok` / `errors`. */
export function validateConfig(body: ConfigBody) {
  return send<ValidateResponse>("POST", "/api/eval/validate", body);
}

export function estimateConfig(body: ConfigBody, full = false) {
  return send<EstimateResponse>(
    "POST",
    `/api/eval/estimate${qs({ full })}`,
    body,
  );
}

export function pingConfig(body: ConfigBody) {
  return send<PingResponse>("POST", "/api/eval/ping", body);
}

// -------------------------------------------------------------- §3.4 running

export function createRun(body: RunRequest) {
  return send<JobSummary>("POST", "/api/eval/runs", body);
}

/** 409 if the run is complete and `add` is absent. */
export function resumeRun(runId: string, body: ResumeRequest = {}) {
  return send<JobSummary>("POST", `/api/eval/runs/${enc(runId)}/resume`, body);
}

/** Poll with `since = n_events` already held. */
export function getJob(id: string, since = 0) {
  return getJson<JobDetail>(`/api/jobs/${enc(id)}${qs({ since })}`);
}

/** Cooperative: takes effect at the engine's next checkpoint. */
export function cancelJob(id: string) {
  return send<JobSummary>("POST", `/api/jobs/${enc(id)}/cancel`);
}

// --------------------------------------------------------- §3.5 reading runs

export function listRuns(limit = 50) {
  return getJson<RunsResponse>(`/api/eval/runs${qs({ limit })}`);
}

export function getRun(runId: string) {
  return getJson<RunDetail>(`/api/eval/runs/${enc(runId)}`);
}

/** Rendered report; 404 until the run is complete. */
export function getReport(runId: string, format: "html" | "md") {
  return getText(`/api/eval/runs/${enc(runId)}/report${qs({ format })}`);
}

export function rebuildReport(runId: string) {
  return send<RebuildReportResponse>(
    "POST",
    `/api/eval/runs/${enc(runId)}/report`,
  );
}

export function getResults(runId: string, query: ResultsQuery = {}) {
  return getJson<ResultsResponse>(
    `/api/eval/runs/${enc(runId)}/results${qs({
      candidate: query.candidate,
      sample_id: query.sample_id,
      only_failed: query.only_failed ? true : undefined,
      offset: query.offset ?? 0,
      limit: Math.min(query.limit ?? 50, 500),
    })}`,
  );
}

export function listRunFiles(runId: string) {
  return getJson<FilesResponse>(`/api/eval/runs/${enc(runId)}/files`);
}

/** 409 while a job is still producing the run. */
export function deleteRun(runId: string) {
  return send<DeleteResponse>("DELETE", `/api/eval/runs/${enc(runId)}`);
}

// ---------------------------------------------------------- §3.6 across runs

export function compareRuns(body: CompareRequest) {
  return send<CompareResponse>("POST", "/api/eval/compare", body);
}

/** 409 if the run had no judge. */
export function calibrateRun(runId: string, body: CalibrateRequest) {
  return send<CalibrateResponse>(
    "POST",
    `/api/eval/runs/${enc(runId)}/calibrate`,
    body,
  );
}

// ------------------------------------------------------------- direct URLs

/** For <iframe src> / download links (no fetch involved). */
export function reportUrl(runId: string, format: "html" | "md"): string {
  return `${API_BASE}/api/eval/runs/${enc(runId)}/report?format=${format}`;
}

export function runFileUrl(runId: string, path: string): string {
  const parts = path.split("/").map(enc).join("/");
  return `${API_BASE}/api/eval/runs/${enc(runId)}/files/${parts}`;
}
