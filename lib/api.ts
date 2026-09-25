/**
 * Typed client for the swarn FastAPI backend (see agent2/agent/web/API.md).
 * All requests go to NEXT_PUBLIC_SWARN_API (falling back to the older
 * NEXT_PUBLIC_API_URL, default http://localhost:8420); the websocket URL for
 * /ws/live is derived from the same base.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_SWARN_API ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8420"
).replace(/\/+$/, "");

/**
 * The websocket URL. An absolute API base is rewritten http→ws; an empty or
 * relative base (the app served behind one reverse proxy with the API) is
 * resolved against the page's own origin.
 */
export function wsLiveUrl(): string {
  if (/^https?:\/\//i.test(API_BASE)) return API_BASE.replace(/^http/i, "ws") + "/ws/live";
  if (typeof window === "undefined") return "ws://localhost:8420/ws/live";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${API_BASE}/ws/live`;
}

// ---------------------------------------------------------------- types

export type Method = "react" | "aide" | "team" | "eval";
export type JobStatus =
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export type StepKind =
  | "plan"
  | "tool_call"
  | "tool_result"
  | "correction"
  | "complete"
  | "error";

/** Event shapes from GET /api/jobs/{id} — all include `ts`. */
export interface JobEvent {
  ts: number;
  type: "status" | "session" | "node" | "cancel_requested" | string;
  // type: "status"
  status?: JobStatus;
  result?: JobResult | null;
  error?: string | null;
  // type: "session"
  session_id?: string;
  // type: "node" (aide)
  step?: number;
  stage?: string;
  is_buggy?: boolean;
  metric?: number | null;
  best_metric?: number | null;
  note?: string;
  suspicious?: boolean;
  // type: "approval_request" / "approval_answered" (the backend sends both ids)
  id?: string;
  request_id?: string;
  question?: string;
  options?: string[];
  default?: string;
  answer?: string;
  // type: "progress" (eval)
  message?: string;
}

/** result payload when a job completes (fields depend on method). */
export interface JobResult {
  // react / team
  outcome?: string;
  summary?: string;
  session_id?: string;
  final_outcome?: string;
  report_markdown?: string;
  // aide
  run_id?: string;
  steps_done?: number;
  best_metric?: number | null;
  solution_path?: string;
  report_path?: string;
  [key: string]: unknown;
}

export interface JobSummary {
  id: string;
  task: string;
  method: Method;
  status: JobStatus;
  created: number;
  started: number | null;
  finished: number | null;
  cancel_requested: boolean;
  session_id: string | null;
  run_id: string | null;
  n_events: number;
  last_event: JobEvent | null;
  resume_session_ids?: string[];
  pending_approvals?: { request_id?: string; id?: string; question?: string; options?: string[]; default?: string }[];
}

export interface JobDetail extends JobSummary {
  result: JobResult | null;
  error: string | null;
  events: JobEvent[];
}

export interface UploadResult {
  data_dir: string;
  relative_dir: string;
  files: string[];
}

export interface UploadBatch {
  batch: string;
  data_dir: string;
  relative_dir: string;
  created: number;
  files: { name: string; size: number }[];
}

export interface SessionSummary {
  id: string;
  task: string;
  model: string;
  outcome: string | null;
  duration_s: number | null;
  tool_calls: number;
  corrections: number;
  started_at: number;
}

/** Structured artifacts on a `tool_result` step (API.md, "Datasets and lineage"). */
export interface StepArtifacts {
  datasets: { name: string; rows: number; cols: number; parents: string[]; tool: string }[];
  files: { path: string; kind: "chart" | "report" | "table" | "model" | "other"; dataset?: string | null }[];
}

export interface SessionStep {
  kind: StepKind;
  time: number;
  data: {
    step?: number;
    tool?: string;
    input?: Record<string, unknown>;
    result?: unknown;
    text?: string;
    error_kind?: string;
    attempt?: number;
    reason?: string;
    summary?: string;
    artifacts?: StepArtifacts;
    [key: string]: unknown;
  };
}

export interface SessionDetail {
  id: string;
  task: string;
  model: string;
  started_at: number;
  ended_at: number | null;
  outcome: string | null;
  summary: string | null;
  corrections: number;
  duration_s: number | null;
  tool_counts: Record<string, number>;
  steps: SessionStep[];
}

export interface RunSummary {
  run_id: string;
  nodes?: number;
  best_metric?: number | null;
  [key: string]: unknown;
}

export interface RunNode {
  step?: number;
  stage?: string;
  is_buggy?: boolean;
  metric?: number | null;
  [key: string]: unknown;
}

export interface RunDetail {
  run_id?: string;
  journal?: RunNode[] | Record<string, unknown>;
  report_markdown?: string | null;
  best_metric?: number | null;
  [key: string]: unknown;
}

export interface RunFile {
  path: string;
  size: number;
}

export interface WorkspaceEntry {
  name: string;
  is_dir: boolean;
  size: number | null;
}

export interface WorkspaceListing {
  path: string;
  entries: WorkspaceEntry[];
}

// ------------------------------------------------------ datasets (/api/data)

export type ColumnKind = "number" | "string" | "date" | "datetime" | "boolean" | "other";

export interface DatasetColumn {
  name: string;
  dtype: string;
  kind: ColumnKind;
}

export interface DatasetInfo {
  name: string;
  rows: number;
  cols: number;
  columns: DatasetColumn[];
  parents: string[];
  tool: string | null;
  session_id: string | null;
  step: number | null;
  created_at: number | null;
  /** columns not present in any parent dataset */
  derived_columns: string[];
}

export interface RowFilter {
  column: string;
  op: "range" | "in" | "contains";
  min?: number | string | null;
  max?: number | string | null;
  values?: unknown[];
  text?: string;
}

export interface RowsQuery {
  offset?: number;
  /** ≤ 1000 */
  limit?: number;
  sort?: string;
  desc?: boolean;
  q?: string;
  filters?: RowFilter[];
}

export interface RowsResponse {
  name: string;
  /** rows after search and filters */
  total: number;
  offset: number;
  limit: number;
  /** column descriptors in row order */
  columns: DatasetColumn[];
  rows: unknown[][];
}

export interface ColumnStats {
  rows: number;
  distinct: number;
  blanks: number;
  kind: ColumnKind;
  min?: number | string | null;
  max?: number | string | null;
  mean?: number | null;
  top: { value: unknown; count: number }[];
}

// ------------------------------------------------------------- ws frames

export interface SessionFrame {
  channel: "session";
  session_id: string;
  task: string;
  kind: StepKind;
  timestamp: number;
  data: SessionStep["data"];
}

export interface JobFrame {
  channel: "job";
  job_id: string;
  method: Method;
  status: JobStatus;
  task: string;
  event: JobEvent;
}

export type LiveFrame = SessionFrame | JobFrame;

// ---------------------------------------------------------------- client

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE} — is the FastAPI server running?`);
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
  return res.json() as Promise<T>;
}

async function apiFetchText(path: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE} — is the FastAPI server running?`);
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.text();
}

// jobs

export interface NewJobRequest {
  task: string;
  method: Method;
  data_dir?: string | null;
  steps?: number;
  /**
   * Prior session ids of the same conversation, oldest first. Only valid for
   * method "react", and every id must belong to a completed run (422 otherwise).
   */
  resume_session_ids?: string[];
}

export const api = {
  createJob: (body: NewJobRequest) =>
    apiFetch<JobSummary>("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  listJobs: () => apiFetch<{ jobs: JobSummary[] }>("/api/jobs"),

  getJob: (id: string, since = 0) =>
    apiFetch<JobDetail>(`/api/jobs/${encodeURIComponent(id)}?since=${since}`),

  cancelJob: (id: string) =>
    apiFetch<{ note?: string } & Partial<JobSummary>>(
      `/api/jobs/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    ),

  /** Answer a parked approval_request. 409 = it timed out and took its default. */
  approveJob: (id: string, request_id: string, answer: string) =>
    apiFetch<JobSummary>(`/api/jobs/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request_id, answer }),
    }),

  // uploads

  listUploads: () => apiFetch<{ uploads: UploadBatch[] }>("/api/uploads"),

  deleteUpload: (batch: string) =>
    apiFetch<unknown>(`/api/uploads/${encodeURIComponent(batch)}`, {
      method: "DELETE",
    }),

  // history

  listSessions: (limit = 50) =>
    apiFetch<{ sessions: SessionSummary[] }>(`/api/sessions?limit=${limit}`),

  getSession: (id: string) =>
    apiFetch<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),

  listRuns: (limit = 50) =>
    apiFetch<{ runs: RunSummary[] }>(`/api/runs?limit=${limit}`),

  getRun: (id: string) =>
    apiFetch<RunDetail>(`/api/runs/${encodeURIComponent(id)}`),

  listRunFiles: (id: string) =>
    apiFetch<{ files: RunFile[] }>(`/api/runs/${encodeURIComponent(id)}/files`),

  // workspace

  listWorkspace: (path = "") =>
    apiFetch<WorkspaceListing>(
      `/api/workspace/files?path=${encodeURIComponent(path)}`,
    ),

  /** Text of a workspace file (markdown reports, CSV previews, logs). */
  getWorkspaceText: (path: string) =>
    apiFetchText(`/api/workspace/file?path=${encodeURIComponent(path)}`),

  // playbook

  getPlaybook: () => apiFetch<{ playbook: string }>("/api/playbook"),

  // datasets and lineage (/api/data/*)

  listDatasets: () => apiFetch<{ datasets: DatasetInfo[] }>("/api/data/datasets"),

  datasetRows: (name: string, q: RowsQuery = {}) => {
    const params = new URLSearchParams();
    params.set("offset", String(q.offset ?? 0));
    params.set("limit", String(Math.min(q.limit ?? 500, 1000)));
    if (q.sort) params.set("sort", q.sort);
    if (q.desc) params.set("desc", "true");
    if (q.q) params.set("q", q.q);
    if (q.filters?.length) params.set("filters", JSON.stringify(q.filters));
    return apiFetch<RowsResponse>(`/api/data/datasets/${encodeURIComponent(name)}/rows?${params.toString()}`);
  },

  datasetColumn: (name: string, column: string) =>
    apiFetch<ColumnStats>(
      `/api/data/datasets/${encodeURIComponent(name)}/columns/${encodeURIComponent(column)}`,
    ),
};

/** Streamed CSV download of a registry dataset. */
export function datasetExportUrl(name: string): string {
  return `${API_BASE}/api/data/datasets/${encodeURIComponent(name)}/export?format=csv`;
}

/** True when the error is the "not in memory" 404 from /api/data. */
export function isDatasetGone(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

/** Direct download / preview URLs (used in <a href> and <img src>). */
export function runFileUrl(runId: string, path: string): string {
  const parts = path.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/api/runs/${encodeURIComponent(runId)}/files/${parts}`;
}

export function workspaceFileUrl(path: string): string {
  return `${API_BASE}/api/workspace/file?path=${encodeURIComponent(path)}`;
}

/**
 * Multipart upload with progress (XMLHttpRequest — fetch has no upload
 * progress events). Field name is `files`, repeatable.
 */
export function uploadFiles(
  files: File[],
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new ApiError(xhr.status, "Malformed upload response"));
        }
      } else {
        let detail = `${xhr.status} upload failed`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (typeof body?.detail === "string") detail = body.detail;
        } catch {
          /* ignore */
        }
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, `Upload failed — cannot reach ${API_BASE}`));
    xhr.send(form);
  });
}
