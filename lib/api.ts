/**
 * Typed client for the swarn backend (swarn-backend, a FastAPI API over
 * PostgreSQL + MinIO that serves agent2's API contract behind Google sign-in).
 * All requests go to NEXT_PUBLIC_SWARN_API (falling back to the older
 * NEXT_PUBLIC_API_URL, default http://localhost:8000); the websocket URL for
 * /ws/live is derived from the same base.
 *
 * Authentication is the HttpOnly `swarn_session` cookie the backend sets after
 * sign-in, so every request is sent with `credentials: "include"`. A 401 means
 * the session is gone: the request fails with ApiError(401) and the registered
 * unauthorized handler (lib/auth.tsx) sends the browser to /login.
 *
 * Every dataset / file / session / run read belongs to a server workspace.
 * Callers pass `workspaceId` explicitly, or rely on the scope set by
 * `setScopedWorkspaceId` (the open workspace); with neither, the backend uses
 * the user's most recently active workspace.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_SWARN_API ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000"
).replace(/\/+$/, "");

/**
 * The websocket URL. An absolute API base is rewritten http→ws; an empty or
 * relative base (the app served behind one reverse proxy with the API) is
 * resolved against the page's own origin. `token` is the 60-second ticket from
 * POST /api/auth/ws-token, needed whenever the socket is cross-origin (the
 * cookie alone authenticates a same-origin socket).
 */
export function wsLiveUrl(token?: string | null): string {
  let url: string;
  if (/^https?:\/\//i.test(API_BASE)) url = API_BASE.replace(/^http/i, "ws") + "/ws/live";
  else if (typeof window === "undefined") url = "ws://localhost:8000/ws/live";
  else {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    url = `${proto}//${window.location.host}${API_BASE}/ws/live`;
  }
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

// ------------------------------------------------------------ workspace scope

let scopedWorkspaceId: string | null = null;

/** The server workspace the open UI workspace maps to (null = let the backend pick). */
export function setScopedWorkspaceId(id: string | null | undefined): void {
  scopedWorkspaceId = id ?? null;
}

export function getScopedWorkspaceId(): string | null {
  return scopedWorkspaceId;
}

/** `workspace_id=` for a query string: the explicit id, else the scope, else nothing. */
function wsParam(workspaceId: string | null | undefined, first = false): string {
  const id = workspaceId === undefined ? scopedWorkspaceId : workspaceId;
  if (!id) return "";
  return `${first ? "?" : "&"}workspace_id=${encodeURIComponent(id)}`;
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

/**
 * Token spend of one job (API.md "Live token usage"): the `usage` events,
 * `JobSummary.usage` and the final status event all carry this shape. The
 * live output figure is `output_tokens + in_flight_output_tokens`; while a
 * call is streaming `estimated` is true and the in-flight part is a
 * client-side count that the next event replaces with the real number.
 */
export interface JobUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  calls: number;
  in_flight_output_tokens: number;
  estimated: boolean;
  cost: number | null;
  currency: string | null;
  elapsed_s: number;
}

/** Event shapes from GET /api/jobs/{id} — all include `ts`. */
export interface JobEvent {
  ts: number;
  type: "status" | "session" | "node" | "usage" | "cancel_requested" | string;
  // type: "status"
  status?: JobStatus;
  result?: JobResult | null;
  error?: string | null;
  /** final status event, and every type: "usage" event (JobUsage fields inline) */
  usage?: JobUsage;
  input_tokens?: number;
  output_tokens?: number;
  in_flight_output_tokens?: number;
  estimated?: boolean;
  calls?: number;
  cost?: number | null;
  currency?: string | null;
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
  /** live token counts; `{}` until the first call completes */
  usage?: JobUsage | Record<string, never>;
  /** the server workspace the job runs in */
  workspace_id?: string;
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
  files: {
    path: string;
    kind: "chart" | "spec" | "report" | "table" | "model" | "other";
    dataset?: string | null;
    /** a `chart` entry's Vega-Lite twin (`plots/<stem>.vl.json`), when the tool wrote one */
    spec?: string | null;
  }[];
  /** LLM-evaluation runs an eval tool's result describes (links to /evals/<run_id>) */
  eval_runs?: { run_id: string; gates_passed: boolean | null; status?: string | null; tool?: string }[];
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
  /** the server workspace the session ran in */
  workspace_id?: string;
  job_id?: string | null;
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

// ------------------------------------------------------------ auth (/api/auth)

export type UserRole = "admin" | "member";

/** GET /api/auth/me */
export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
}

/** GET /api/auth/sessions — the user's own sign-ins (browser cookies and CLI tokens). */
export interface AuthSessionInfo {
  id: string;
  kind: "browser" | "cli";
  label: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  user_agent: string | null;
  current: boolean;
}

// ------------------------------------------------- server workspaces (/api/workspaces)

/** One row of GET /api/workspaces — the ownership unit for datasets, files, sessions and jobs. */
export interface ServerWorkspace {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  last_job_at: number | null;
  running_job_id: string | null;
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

export const UNREACHABLE = `Cannot reach the API at ${API_BASE} — is swarn-backend running?`;

type UnauthorizedHandler = (path: string) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Called once per 401 with the request path. lib/auth.tsx registers the
 * redirect to /login; tests and the login page itself leave it unset.
 */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  onUnauthorized = fn;
}

/** Turn a non-2xx response into an ApiError carrying the backend's `detail`. */
export async function errorFrom(res: Response, path = ""): Promise<ApiError> {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string") detail = body.detail;
    else if (body?.detail) detail = JSON.stringify(body.detail);
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401) onUnauthorized?.(path);
  return new ApiError(res.status, detail);
}

/** fetch with the session cookie; throws ApiError(0) when the server is unreachable. */
export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", credentials: "include", ...init });
  } catch {
    throw new ApiError(0, UNREACHABLE);
  }
  if (!res.ok) throw await errorFrom(res, path);
  return res;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiRequest(path, init);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function apiFetchText(path: string): Promise<string> {
  const res = await apiRequest(path);
  return res.text();
}

const JSON_HEADERS = { "Content-Type": "application/json" };

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
  /** the server workspace to run in; omitted = the user's `Scratch` workspace */
  workspace_id?: string | null;
}

export const api = {
  // auth

  /** The signed-in user; 401 when there is no valid session cookie. */
  me: () => apiFetch<AuthUser>("/api/auth/me"),

  /** End this browser session (the cookie is cleared by the response). */
  logout: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),

  /** End every session of the user, browser and CLI alike. */
  logoutAll: () => apiFetch<void>("/api/auth/logout-all", { method: "POST" }),

  /** A 60-second ticket that authenticates a cross-origin /ws/live socket. */
  wsToken: () => apiFetch<{ token: string; expires_in: number }>("/api/auth/ws-token", { method: "POST" }),

  listAuthSessions: () => apiFetch<{ sessions: AuthSessionInfo[] }>("/api/auth/sessions"),

  revokeAuthSession: (id: string) =>
    apiFetch<void>(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // server workspaces

  listWorkspaces: () => apiFetch<{ workspaces: ServerWorkspace[] }>("/api/workspaces"),

  createWorkspace: (name: string) =>
    apiFetch<ServerWorkspace>("/api/workspaces", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name }) }),

  getWorkspace: (id: string) => apiFetch<ServerWorkspace>(`/api/workspaces/${encodeURIComponent(id)}`),

  renameWorkspace: (id: string, name: string) =>
    apiFetch<ServerWorkspace>(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    }),

  /** 409 while a job is still running in the workspace. */
  deleteWorkspace: (id: string) => apiFetch<void>(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** The UI's thread tree as the server last saw it (null when never saved). */
  getWorkspaceState: <T = unknown>(id: string) =>
    apiFetch<{ workspace_id: string; state: T | null }>(`/api/workspaces/${encodeURIComponent(id)}/state`),

  /** Save the UI's thread tree (≤ 2 MB of JSON). */
  putWorkspaceState: (id: string, state: unknown) =>
    apiFetch<{ workspace_id: string; saved: boolean }>(`/api/workspaces/${encodeURIComponent(id)}/state`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(state),
    }),

  // jobs

  createJob: (body: NewJobRequest) =>
    apiFetch<JobSummary>("/api/jobs", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    }),

  /** The user's jobs, newest first; `workspaceId` narrows to one workspace. */
  listJobs: (workspaceId: string | null = null) => apiFetch<{ jobs: JobSummary[] }>(`/api/jobs${wsParam(workspaceId, true)}`),

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

  listSessions: (limit = 50, workspaceId?: string | null) =>
    apiFetch<{ sessions: SessionSummary[] }>(`/api/sessions?limit=${limit}${wsParam(workspaceId)}`),

  getSession: (id: string) =>
    apiFetch<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),

  listRuns: (limit = 50, workspaceId?: string | null) =>
    apiFetch<{ runs: RunSummary[] }>(`/api/runs?limit=${limit}${wsParam(workspaceId)}`),

  getRun: (id: string) =>
    apiFetch<RunDetail>(`/api/runs/${encodeURIComponent(id)}`),

  listRunFiles: (id: string) =>
    apiFetch<{ files: RunFile[] }>(`/api/runs/${encodeURIComponent(id)}/files`),

  // workspace

  listWorkspace: (path = "", workspaceId?: string | null) =>
    apiFetch<WorkspaceListing>(
      `/api/workspace/files?path=${encodeURIComponent(path)}${wsParam(workspaceId)}`,
    ),

  /** Text of a workspace file (markdown reports, CSV previews, logs). */
  getWorkspaceText: (path: string, workspaceId?: string | null) =>
    apiFetchText(`/api/workspace/file?path=${encodeURIComponent(path)}${wsParam(workspaceId)}`),

  /** A JSON workspace file — an agent chart's Vega-Lite spec (`plots/*.vl.json`). */
  getWorkspaceJson: <T = Record<string, unknown>>(path: string, workspaceId?: string | null) =>
    apiFetch<T>(`/api/workspace/file?path=${encodeURIComponent(path)}${wsParam(workspaceId)}`),

  // playbook

  getPlaybook: () => apiFetch<{ playbook: string }>("/api/playbook"),

  // datasets and lineage (/api/data/*)

  listDatasets: (workspaceId?: string | null) =>
    apiFetch<{ datasets: DatasetInfo[] }>(`/api/data/datasets${wsParam(workspaceId, true)}`),

  datasetRows: (name: string, q: RowsQuery = {}, workspaceId?: string | null) => {
    const params = new URLSearchParams();
    params.set("offset", String(q.offset ?? 0));
    params.set("limit", String(Math.min(q.limit ?? 500, 1000)));
    if (q.sort) params.set("sort", q.sort);
    if (q.desc) params.set("desc", "true");
    if (q.q) params.set("q", q.q);
    if (q.filters?.length) params.set("filters", JSON.stringify(q.filters));
    return apiFetch<RowsResponse>(
      `/api/data/datasets/${encodeURIComponent(name)}/rows?${params.toString()}${wsParam(workspaceId)}`,
    );
  },

  datasetColumn: (name: string, column: string, workspaceId?: string | null) =>
    apiFetch<ColumnStats>(
      `/api/data/datasets/${encodeURIComponent(name)}/columns/${encodeURIComponent(column)}${wsParam(workspaceId, true)}`,
    ),
};

/** Streamed CSV download of a registry dataset. */
export function datasetExportUrl(name: string, workspaceId?: string | null): string {
  return `${API_BASE}/api/data/datasets/${encodeURIComponent(name)}/export?format=csv${wsParam(workspaceId)}`;
}

// ------------------------------------------------------------ sign-in URLs

/** Where the browser goes to sign in with Google; `next` is a path on this app. */
export function googleLoginUrl(next = "/"): string {
  return `${API_BASE}/api/auth/google/login?redirect_to=${encodeURIComponent(safeNext(next))}`;
}

/**
 * Development only: signs `email` in without Google. The backend serves it only
 * with BACKEND_DEV_LOGIN=1, no Google client id, and a localhost public URL.
 */
export function devLoginUrl(email: string, next = "/"): string {
  return `${API_BASE}/api/auth/dev-login?email=${encodeURIComponent(email)}&redirect_to=${encodeURIComponent(safeNext(next))}`;
}

/** Only same-app paths survive, so a `next` from the URL can never leave the site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
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

export function workspaceFileUrl(path: string, workspaceId?: string | null): string {
  return `${API_BASE}/api/workspace/file?path=${encodeURIComponent(path)}${wsParam(workspaceId)}`;
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
    xhr.withCredentials = true; // the session cookie
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
        if (xhr.status === 401) onUnauthorized?.("/api/upload");
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, `Upload failed — cannot reach ${API_BASE}`));
    xhr.send(form);
  });
}
