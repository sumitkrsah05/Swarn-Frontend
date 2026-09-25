/**
 * The workspace data model (docs/guide.md §7.3): a turn TREE rather than a
 * linear thread. Pure functions only — no React, no storage — so every rule
 * here is unit-tested in lib/workspace.test.ts.
 *
 * Key rule: when a turn is submitted, `resume_session_ids` is the completed
 * session ids of ITS ANCESTORS ONLY, oldest first. Siblings on other
 * branches never leak into the context.
 */

import type { JobStatus, SessionStep } from "./api";

/** An uploaded batch passed to the agent as `data_dir`. */
export interface ChatAttachment {
  data_dir: string;
  label: string;
  files: string[];
}

export const WORKSPACES_KEY = "swarn:workspaces:v2";
export const THREADS_V1_KEY = "swarn:threads:v1";
/** persisted `steps` per turn are capped to the last N */
export const STEPS_CAP = 300;
const TITLE_MAX = 48;

export type TurnStatus = JobStatus;

export interface DatasetArtifact {
  name: string;
  rows: number;
  cols: number;
  parents: string[];
  tool: string;
  step: number;
}

export interface ChartArtifact {
  /** stable per-chart id (path for png charts, a uuid for vega charts) */
  id: string;
  kind: "png" | "vega";
  /** workspace-relative path for png charts */
  path?: string;
  dataset?: string;
  tool: string;
  step: number;
  /** vega charts: the Vega-Lite spec (data is fetched at render time) */
  spec?: Record<string, unknown>;
  /** vega charts: the editor configuration the spec was built from */
  config?: Record<string, unknown>;
  title?: string;
  /** the tool input that produced a png chart (prefills "Edit chart") */
  input?: Record<string, unknown>;
}

export interface ReportArtifact {
  htmlPath?: string;
  mdPath?: string;
  dataset?: string;
  title: string;
  step: number;
}

export interface FileArtifact {
  path: string;
  kind: "chart" | "report" | "table" | "model" | "other";
  step: number;
  tool: string;
}

export interface TurnArtifacts {
  datasets: DatasetArtifact[];
  charts: ChartArtifact[];
  reports: ReportArtifact[];
  files: FileArtifact[];
}

export interface Turn {
  id: string;
  /** the turn this was asked from (branching = shared parent) */
  parentId: string | null;
  /** exactly which card was focused when asked */
  parentArtifact?: ArtifactRef;
  /** as typed, including @mentions */
  prompt: string;
  attachment?: ChatAttachment;
  /** @-mentioned dataset names (also the focused dataset) */
  mentions?: string[];
  jobId: string | null;
  /** set on completion */
  sessionId: string | null;
  status: TurnStatus;
  /** live feed; the persisted copy is capped (STEPS_CAP) */
  steps: SessionStep[];
  artifacts: TurnArtifacts;
  /** result.summary */
  answer?: string;
  outcome?: string;
  failure?: string;
  /** unix seconds */
  startedAt: number;
  finishedAt?: number;
  /** a user turn (jobId null), e.g. "Quick chart: Bar" */
  manual?: boolean;
  /** the composer shortcut that created the turn, if any */
  intent?: "report" | "suggest";
  /** a parked agent question (approval_request) awaiting the user */
  question?: AgentQuestion;
}

export interface AgentQuestion {
  requestId: string;
  question: string;
  options: string[];
  default?: string;
}

export type ArtifactRef =
  | { kind: "turn"; turnId: string }
  | { kind: "dataset"; turnId: string | null; name: string }
  | { kind: "chart"; turnId: string; index: number }
  | { kind: "report"; turnId: string; index: number }
  | { kind: "answer"; turnId: string };

export type Focus = ArtifactRef;

export interface Workspace {
  id: string;
  name: string;
  /** unix seconds */
  createdAt: number;
  updatedAt: number;
  turns: Turn[];
  focus: Focus | null;
  /** refKey()s of chart cards not yet focused */
  unread: string[];
  /** dataset cards hidden in this workspace (the dataset stays on the server) */
  hiddenDatasets?: string[];
}

/**
 * A v4 UUID that also works on plain-HTTP origins: `crypto.randomUUID` exists
 * only in secure contexts (HTTPS / localhost), and the app is often opened at
 * a VM's IP over http.
 */
export function uid(): string {
  const c = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ------------------------------------------------------------ constructors

export function emptyArtifacts(): TurnArtifacts {
  return { datasets: [], charts: [], reports: [], files: [] };
}

export function titleFrom(text: string, fallback = "Untitled workspace"): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return fallback;
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX).trimEnd() + "…" : t;
}

export function makeWorkspace(name?: string): Workspace {
  const now = Date.now() / 1000;
  return {
    id: uid(),
    name: name?.trim() || "Untitled workspace",
    createdAt: now,
    updatedAt: now,
    turns: [],
    focus: null,
    unread: [],
    hiddenDatasets: [],
  };
}

export function makeTurn(init: {
  prompt: string;
  parentId: string | null;
  parentArtifact?: ArtifactRef;
  attachment?: ChatAttachment;
  mentions?: string[];
  manual?: boolean;
  intent?: Turn["intent"];
}): Turn {
  return {
    id: uid(),
    parentId: init.parentId,
    parentArtifact: init.parentArtifact,
    prompt: init.prompt,
    attachment: init.attachment,
    mentions: init.mentions?.length ? init.mentions : undefined,
    jobId: null,
    sessionId: null,
    status: init.manual ? "complete" : "queued",
    steps: [],
    artifacts: emptyArtifacts(),
    startedAt: Date.now() / 1000,
    finishedAt: init.manual ? Date.now() / 1000 : undefined,
    manual: init.manual || undefined,
    intent: init.intent,
  };
}

// ------------------------------------------------------------------ lookups

export function turnById(ws: Workspace | undefined | null, id: string | null | undefined): Turn | undefined {
  if (!id || !ws) return undefined;
  return ws.turns.find((t) => t.id === id);
}

export function childrenOf(ws: Workspace, id: string | null): Turn[] {
  return ws.turns.filter((t) => t.parentId === id);
}

export function roots(ws: Workspace): Turn[] {
  const ids = new Set(ws.turns.map((t) => t.id));
  return ws.turns.filter((t) => t.parentId === null || !ids.has(t.parentId));
}

/** Ancestors of a turn, ROOT FIRST, excluding the turn itself. */
export function ancestors(ws: Workspace, turnId: string | null): Turn[] {
  const out: Turn[] = [];
  const seen = new Set<string>();
  const start = turnById(ws, turnId);
  if (start) seen.add(start.id);
  let cur = turnById(ws, start?.parentId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = turnById(ws, cur.parentId);
  }
  return out.reverse();
}

/**
 * The `resume_session_ids` for a new turn asked from `parentId`: the
 * completed session ids of the parent and its ancestors, oldest first.
 */
export function resumeChain(ws: Workspace, parentId: string | null): string[] {
  const chain = parentId ? [...ancestors(ws, parentId)] : [];
  // ancestors() excludes the node itself, so add the parent at the end
  const parent = turnById(ws, parentId);
  if (parent) chain.push(parent);
  return chain
    .filter((t) => t.status === "complete" && !!t.sessionId)
    .map((t) => t.sessionId as string);
}

export function isRunning(t: Turn | undefined | null): boolean {
  return !!t && (t.status === "queued" || t.status === "running");
}

export function activeTurn(ws: Workspace): Turn | undefined {
  return ws.turns.find((t) => isRunning(t));
}

/** Turn ids on the path from the root down to `turnId` (inclusive). */
export function lineageIds(ws: Workspace, turnId: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!turnId) return set;
  for (const t of ancestors(ws, turnId)) set.add(t.id);
  set.add(turnId);
  return set;
}

export function subtreeIds(ws: Workspace, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const c of childrenOf(ws, cur)) stack.push(c.id);
  }
  return out;
}

/** The newest turn (by start time) — where focus normally rests. */
export function newestTurn(ws: Workspace): Turn | undefined {
  let best: Turn | undefined;
  for (const t of ws.turns) if (!best || t.startedAt >= best.startedAt) best = t;
  return best;
}

// --------------------------------------------------------------------- refs

export function refKey(ref: ArtifactRef): string {
  switch (ref.kind) {
    case "turn":
      return `turn:${ref.turnId}`;
    case "dataset":
      return `dataset:${ref.turnId ?? "-"}:${ref.name}`;
    case "chart":
      return `chart:${ref.turnId}:${ref.index}`;
    case "report":
      return `report:${ref.turnId}:${ref.index}`;
    case "answer":
      return `answer:${ref.turnId}`;
  }
}

export function sameRef(a: ArtifactRef | null | undefined, b: ArtifactRef | null | undefined): boolean {
  if (!a || !b) return false;
  return refKey(a) === refKey(b);
}

export function refTurnId(ref: ArtifactRef | null | undefined): string | null {
  if (!ref) return null;
  return ref.turnId ?? null;
}

/** The dataset a focus refers to, if any (charts resolve to their table). */
export function refDataset(ws: Workspace, ref: ArtifactRef | null | undefined): string | null {
  if (!ref) return null;
  if (ref.kind === "dataset") return ref.name;
  if (ref.kind === "chart") {
    const t = turnById(ws, ref.turnId);
    return t?.artifacts.charts[ref.index]?.dataset ?? null;
  }
  return null;
}

// ------------------------------------------------------------------ updates

export function touch(ws: Workspace): Workspace {
  return { ...ws, updatedAt: Date.now() / 1000 };
}

export function upsertTurn(ws: Workspace, turn: Turn): Workspace {
  const exists = ws.turns.some((t) => t.id === turn.id);
  return touch({
    ...ws,
    turns: exists ? ws.turns.map((t) => (t.id === turn.id ? turn : t)) : [...ws.turns, turn],
  });
}

export function updateTurn(ws: Workspace, id: string, fn: (t: Turn) => Turn): Workspace {
  let changed = false;
  const turns = ws.turns.map((t) => {
    if (t.id !== id) return t;
    changed = true;
    return fn(t);
  });
  return changed ? touch({ ...ws, turns }) : ws;
}

/** Remove a turn and its whole subtree; focus and unread are cleaned up. */
export function deleteSubtree(ws: Workspace, id: string): Workspace {
  const gone = new Set(subtreeIds(ws, id));
  const focus = ws.focus && refTurnId(ws.focus) && gone.has(refTurnId(ws.focus) as string) ? null : ws.focus;
  return touch({
    ...ws,
    turns: ws.turns.filter((t) => !gone.has(t.id)),
    focus,
    unread: ws.unread.filter((k) => ![...gone].some((g) => k.includes(`:${g}:`) || k.endsWith(`:${g}`))),
  });
}

/** Remove one chart from a turn; later chart refs shift down by one. */
export function deleteChart(ws: Workspace, turnId: string, index: number): Workspace {
  const next = updateTurn(ws, turnId, (t) => ({
    ...t,
    artifacts: { ...t.artifacts, charts: t.artifacts.charts.filter((_, i) => i !== index) },
  }));
  const focus =
    next.focus && next.focus.kind === "chart" && next.focus.turnId === turnId
      ? next.focus.index === index
        ? null
        : next.focus.index > index
          ? { ...next.focus, index: next.focus.index - 1 }
          : next.focus
      : next.focus;
  const unread = next.unread
    .map((k) => {
      const m = /^chart:([^:]+):(\d+)$/.exec(k);
      if (!m || m[1] !== turnId) return k;
      const i = Number(m[2]);
      if (i === index) return null;
      return i > index ? `chart:${turnId}:${i - 1}` : k;
    })
    .filter((k): k is string => !!k);
  return { ...next, focus, unread };
}

export function hideDataset(ws: Workspace, name: string): Workspace {
  const hidden = new Set(ws.hiddenDatasets ?? []);
  hidden.add(name);
  const focus = ws.focus?.kind === "dataset" && ws.focus.name === name ? null : ws.focus;
  return touch({ ...ws, hiddenDatasets: [...hidden], focus });
}

export function setFocus(ws: Workspace, focus: Focus | null): Workspace {
  const key = focus ? refKey(focus) : null;
  const unread = key ? ws.unread.filter((k) => k !== key) : ws.unread;
  if (sameRef(ws.focus, focus) && unread.length === ws.unread.length) return ws;
  return { ...ws, focus, unread };
}

export function markUnread(ws: Workspace, ref: ArtifactRef): Workspace {
  const key = refKey(ref);
  if (ws.unread.includes(key)) return ws;
  return { ...ws, unread: [...ws.unread, key] };
}

// ---------------------------------------------------------------- statistics

export function chartCount(ws: Workspace): number {
  return ws.turns.reduce((n, t) => n + t.artifacts.charts.length, 0);
}

/** Path of the most recently produced png chart (cover thumbnails). */
export function latestChartPath(ws: Workspace): string | null {
  const sorted = [...ws.turns].sort((a, b) => b.startedAt - a.startedAt);
  for (const t of sorted) {
    for (let i = t.artifacts.charts.length - 1; i >= 0; i--) {
      const c = t.artifacts.charts[i];
      if (c.kind === "png" && c.path) return c.path;
    }
  }
  return null;
}

/** Number of thread columns a workspace has (roots + forks). */
export function threadCount(ws: Workspace): number {
  let n = 0;
  for (const t of ws.turns) {
    const parent = turnById(ws, t.parentId);
    if (!parent) n += 1;
    else if (childrenOf(ws, parent.id)[0]?.id !== t.id) n += 1;
  }
  return n;
}

// -------------------------------------------------------------- persistence

/** Cap the live step feed before writing to localStorage. */
export function forPersist(ws: Workspace): Workspace {
  return {
    ...ws,
    turns: ws.turns.map((t) =>
      t.steps.length > STEPS_CAP ? { ...t, steps: t.steps.slice(-STEPS_CAP) } : t,
    ),
  };
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

function sanitizeArtifacts(raw: unknown): TurnArtifacts {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    datasets: arr(a.datasets).filter((d) => d && typeof d === "object" && typeof (d as DatasetArtifact).name === "string") as DatasetArtifact[],
    charts: arr(a.charts)
      .filter((c) => c && typeof c === "object")
      .map((c) => {
        const o = c as ChartArtifact;
        return { ...o, id: o.id || o.path || uid(), kind: o.kind === "vega" ? "vega" : "png" };
      }),
    reports: arr(a.reports).filter((r) => r && typeof r === "object") as ReportArtifact[],
    files: arr(a.files).filter((f) => f && typeof f === "object") as FileArtifact[],
  };
}

const STATUSES: TurnStatus[] = ["queued", "running", "complete", "failed", "cancelled"];

function sanitizeTurn(raw: unknown): Turn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  let status = STATUSES.includes(o.status as TurnStatus) ? (o.status as TurnStatus) : "complete";
  const jobId = typeof o.jobId === "string" ? o.jobId : null;
  // an in-flight status without a job to poll can never resolve
  if (!jobId && (status === "queued" || status === "running")) status = "failed";
  return {
    id: o.id,
    parentId: typeof o.parentId === "string" ? o.parentId : null,
    parentArtifact: o.parentArtifact as ArtifactRef | undefined,
    prompt: str(o.prompt),
    attachment: o.attachment as ChatAttachment | undefined,
    mentions: Array.isArray(o.mentions) ? o.mentions.filter((m): m is string => typeof m === "string") : undefined,
    jobId,
    sessionId: typeof o.sessionId === "string" ? o.sessionId : null,
    status,
    steps: Array.isArray(o.steps) ? (o.steps as SessionStep[]).slice(-STEPS_CAP) : [],
    artifacts: sanitizeArtifacts(o.artifacts),
    answer: typeof o.answer === "string" ? o.answer : undefined,
    outcome: typeof o.outcome === "string" ? o.outcome : undefined,
    failure:
      typeof o.failure === "string"
        ? o.failure
        : !jobId && (o.status === "queued" || o.status === "running")
          ? "The page was closed before the run was submitted. Retry to resubmit."
          : undefined,
    startedAt: num(o.startedAt, 0),
    finishedAt: typeof o.finishedAt === "number" ? o.finishedAt : undefined,
    manual: o.manual === true || undefined,
    intent: o.intent === "report" || o.intent === "suggest" ? o.intent : undefined,
    question: o.question && typeof o.question === "object" ? (o.question as AgentQuestion) : undefined,
  };
}

export function sanitizeWorkspaces(raw: unknown): Workspace[] {
  if (!Array.isArray(raw)) return [];
  const out: Workspace[] = [];
  for (const w of raw) {
    if (!w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    if (typeof o.id !== "string") continue;
    const turns = (Array.isArray(o.turns) ? o.turns : []).map(sanitizeTurn).filter((t): t is Turn => !!t);
    const ids = new Set(turns.map((t) => t.id));
    out.push({
      id: o.id,
      name: str(o.name, "Untitled workspace"),
      createdAt: num(o.createdAt, 0),
      updatedAt: num(o.updatedAt, num(o.createdAt, 0)),
      turns: turns.map((t) => (t.parentId && !ids.has(t.parentId) ? { ...t, parentId: null } : t)),
      focus: (o.focus && typeof o.focus === "object" ? (o.focus as Focus) : null) ?? null,
      unread: Array.isArray(o.unread) ? o.unread.filter((k): k is string => typeof k === "string") : [],
      hiddenDatasets: Array.isArray(o.hiddenDatasets)
        ? o.hiddenDatasets.filter((k): k is string => typeof k === "string")
        : [],
    });
  }
  return out;
}

// ---------------------------------------------------------------- migration

interface V1Message {
  id?: string;
  role?: "user" | "assistant";
  text?: string;
  ts?: number;
  attachment?: ChatAttachment;
  sessionId?: string;
  outcome?: string;
  failure?: string;
}

/**
 * Convert `swarn:threads:v1` threads into workspaces whose turns form one
 * linear chain: each user message plus its following assistant message
 * becomes one turn. The v1 key itself is left untouched by the caller.
 */
export function migrateThreadsV1(raw: unknown): Workspace[] {
  const data = raw && typeof raw === "object" ? (raw as { threads?: unknown }) : null;
  const threads = Array.isArray(data?.threads) ? data.threads : Array.isArray(raw) ? raw : [];
  const out: Workspace[] = [];
  for (const th of threads) {
    if (!th || typeof th !== "object") continue;
    const t = th as Record<string, unknown>;
    const messages = (Array.isArray(t.messages) ? t.messages : []) as V1Message[];
    const createdAt = num(t.createdAt, Date.now() / 1000);
    const ws: Workspace = {
      id: typeof t.id === "string" ? `v1-${t.id}` : uid(),
      name: str(t.title) || titleFrom(messages.find((m) => m.role === "user")?.text ?? ""),
      createdAt,
      updatedAt: createdAt,
      turns: [],
      focus: null,
      unread: [],
      hiddenDatasets: [],
    };
    let parentId: string | null = null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "user") continue;
      const reply = messages[i + 1]?.role === "assistant" ? messages[i + 1] : undefined;
      const status: TurnStatus = m.failure ? "failed" : reply ? "complete" : "cancelled";
      const turn: Turn = {
        id: uid(),
        parentId,
        prompt: str(m.text),
        attachment: m.attachment,
        jobId: null,
        sessionId: reply?.sessionId ?? null,
        status,
        steps: [],
        artifacts: emptyArtifacts(),
        answer: reply?.text,
        outcome: reply?.outcome,
        failure: m.failure ?? (reply ? undefined : "This turn has no recorded reply."),
        startedAt: num(m.ts, createdAt),
        finishedAt: reply ? num(reply.ts, undefined as unknown as number) || undefined : undefined,
      };
      ws.turns.push(turn);
      parentId = turn.id;
      if (turn.startedAt > ws.updatedAt) ws.updatedAt = turn.startedAt;
    }
    if (ws.turns.length > 0) {
      const last = ws.turns[ws.turns.length - 1];
      ws.focus = last.answer ? { kind: "answer", turnId: last.id } : null;
      out.push(ws);
    }
  }
  return out;
}

// ----------------------------------------------------------- import/export

export function exportWorkspace(ws: Workspace): string {
  return JSON.stringify({ version: 2, workspace: forPersist(ws) }, null, 2);
}

export function importWorkspace(text: string): Workspace | null {
  try {
    const parsed = JSON.parse(text) as { version?: number; workspace?: unknown } | unknown;
    const raw =
      parsed && typeof parsed === "object" && "workspace" in parsed
        ? (parsed as { workspace: unknown }).workspace
        : parsed;
    const [ws] = sanitizeWorkspaces([raw]);
    if (!ws) return null;
    // a fresh id so an import never clobbers the original
    return { ...ws, id: uid(), updatedAt: Date.now() / 1000 };
  } catch {
    return null;
  }
}
