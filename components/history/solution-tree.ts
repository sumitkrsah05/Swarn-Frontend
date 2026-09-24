/**
 * An AIDE journal as a turn tree (docs/guide.md §8.2): every node becomes a
 * turn whose parent is the node it debugged or improved, so children fork
 * into thread columns exactly like a workspace. Pure; no React.
 */

import type { RunDetail } from "@/lib/api";
import type { Turn, Workspace } from "@/lib/workspace";

export interface JournalNode {
  id: string;
  parent_id: string | null;
  step: number;
  stage: string;
  plan: string;
  code: string;
  analysis: string;
  metric: number | null;
  lower_is_better: boolean;
  is_buggy: boolean;
  suspicious?: boolean;
  diagnosis?: string;
  next_action?: string;
  term_out?: string;
  exit_code?: number;
  timed_out?: boolean;
  ctime?: number;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/** Normalise the journal payload: an array of nodes or `{nodes: [...]}`. */
export function journalNodes(journal: RunDetail["journal"]): JournalNode[] {
  const raw: unknown[] = Array.isArray(journal)
    ? journal
    : journal && typeof journal === "object" && Array.isArray((journal as { nodes?: unknown }).nodes)
      ? ((journal as { nodes: unknown[] }).nodes)
      : [];
  const out: JournalNode[] = [];
  raw.forEach((n, i) => {
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const parent = typeof o.parent_id === "string" && o.parent_id !== "None" ? o.parent_id : typeof o.parent === "string" ? o.parent : null;
    out.push({
      id: str(o.id, `node-${i}`),
      parent_id: parent,
      step: typeof o.step === "number" ? o.step : i,
      stage: str(o.stage, "draft"),
      plan: str(o.plan),
      code: str(o.code),
      analysis: str(o.analysis),
      metric: num(o.metric),
      lower_is_better: o.lower_is_better === true,
      is_buggy: o.is_buggy !== false,
      suspicious: o.suspicious === true,
      diagnosis: str(o.diagnosis) || undefined,
      next_action: str(o.next_action) || undefined,
      term_out: str(o.term_out) || undefined,
      exit_code: typeof o.exit_code === "number" ? o.exit_code : undefined,
      timed_out: o.timed_out === true,
      ctime: num(o.ctime) ?? undefined,
    });
  });
  return out.sort((a, b) => a.step - b.step);
}

/** The champion: a good, non-suspicious node with the best metric. */
export function bestNode(nodes: JournalNode[]): JournalNode | null {
  const pool = nodes.filter((n) => !n.is_buggy && !n.suspicious && n.metric != null);
  if (!pool.length) return null;
  const lower = pool.some((n) => n.lower_is_better);
  return pool.reduce((best, n) => ((lower ? (n.metric as number) < (best.metric as number) : (n.metric as number) > (best.metric as number)) ? n : best));
}

function answerFor(n: JournalNode, best: boolean): string {
  const parts: string[] = [];
  const metric = n.metric != null ? `**metric ${n.metric.toPrecision(5)}**${n.lower_is_better ? " (lower is better)" : ""}${best ? " · ★ best" : ""}` : "_no metric_";
  parts.push(`${metric}${n.is_buggy ? " · buggy" : ""}${n.suspicious ? " · suspicious" : ""}`);
  if (n.diagnosis) parts.push(`**Diagnosis:** ${n.diagnosis}${n.next_action ? ` → ${n.next_action}` : ""}`);
  if (n.analysis) parts.push(`### Review\n\n${n.analysis}`);
  if (n.term_out) parts.push(`### Output${n.exit_code ? ` (exit ${n.exit_code})` : ""}${n.timed_out ? " · timed out" : ""}\n\n\`\`\`text\n${n.term_out.slice(-4000)}\n\`\`\``);
  if (n.code) parts.push(`### Code\n\n\`\`\`python\n${n.code}\n\`\`\``);
  return parts.join("\n\n");
}

/** A read-only workspace whose turns mirror the solution tree. */
export function workspaceFromJournal(runId: string, nodes: JournalNode[]): Workspace {
  const champion = bestNode(nodes);
  const ids = new Set(nodes.map((n) => n.id));
  const turns: Turn[] = nodes.map((n) => {
    const best = champion?.id === n.id;
    const label = `${best ? "★ best · " : ""}#${n.step} ${n.stage}${n.diagnosis ? ` · ${n.diagnosis}` : ""}`;
    return {
      id: n.id,
      parentId: n.parent_id && ids.has(n.parent_id) ? n.parent_id : null,
      prompt: label,
      jobId: null,
      sessionId: null,
      status: n.is_buggy ? "failed" : "complete",
      // the plan reads as the agent's plan line; expanding it shows the step
      steps: n.plan ? [{ kind: "plan", time: n.ctime ?? n.step, data: { step: n.step, text: n.plan } }] : [],
      artifacts: { datasets: [], charts: [], reports: [], files: [] },
      answer: answerFor(n, best),
      outcome: n.is_buggy ? "buggy" : "complete",
      failure: n.is_buggy ? `Buggy attempt${n.exit_code ? ` (exit ${n.exit_code})` : ""}${n.timed_out ? " — timed out" : ""}.` : undefined,
      startedAt: n.step,
      finishedAt: n.step,
    };
  });
  const now = Date.now() / 1000;
  return {
    id: `run-${runId}`,
    name: runId,
    createdAt: nodes[0]?.ctime ?? now,
    updatedAt: now,
    turns,
    focus: champion ? { kind: "answer", turnId: champion.id } : null,
    unread: [],
    hiddenDatasets: [],
  };
}
