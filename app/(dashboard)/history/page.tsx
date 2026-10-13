"use client";

/**
 * History (docs/guide.md §8.2): tabs Sessions · AIDE runs. `/sessions` and
 * `/runs` redirect here (next.config.ts); the detail routes keep working.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type RunSummary, type SessionSummary } from "@/lib/api";
import { formatDuration, formatMetric, formatTime } from "@/lib/format";
import { useActiveWorkspace } from "@/lib/workspace-store";
import {
  Badge,
  CellText,
  EmptyNote,
  ErrorNote,
  HistoryIcon,
  Loading,
  PageFrame,
  PillButton,
  SectionLabel,
  SkeletonRows,
  TABLE,
  TD,
  TH,
  TableWrap,
  Tabs,
  TreeIcon,
} from "@/components/ui";

type TabId = "sessions" | "runs";

/** `null` = every workspace of the user; a server id = that workspace only */
type Scope = string | null;

function SessionsTab({ scope }: { scope: Scope }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listSessions(100, scope)
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [scope]);

  if (error) return <ErrorNote message={error} />;
  if (sessions === null) return <SkeletonRows rows={6} />;
  if (sessions.length === 0) {
    return (
      <EmptyNote icon={<HistoryIcon size={26} />} title="No sessions yet" hint="ReAct and Team runs record a full step trace here once they finish." />
    );
  }
  return (
    <TableWrap maxHeight="calc(100vh - 12rem)">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>Task</th>
            <th className={TH}>Outcome</th>
            <th className={TH}>Tools</th>
            <th className={TH}>Duration</th>
            <th className={TH}>Model</th>
            <th className={TH}>Started</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className="cursor-pointer bg-panel transition-colors hover:bg-hover" onClick={() => router.push(`/sessions/${s.id}`)}>
              <td className={TD}>
                <CellText width="min(36rem, 45vw)">
                  <Link href={`/sessions/${s.id}`} className="text-13 text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                    {s.task}
                  </Link>
                </CellText>
                <span className="block font-mono text-11 text-faint">{s.id.slice(0, 8)}</span>
              </td>
              <td className={TD}>
                <Badge tone={s.outcome === "complete" ? "ok" : "warn"}>{s.outcome ?? "—"}</Badge>
              </td>
              <td className={`${TD} font-mono text-11 text-muted`}>
                {s.tool_calls} calls{s.corrections > 0 ? ` · ${s.corrections} fixes` : ""}
              </td>
              <td className={`${TD} font-mono text-11 text-muted`}>{formatDuration(s.duration_s)}</td>
              <td className={`${TD} font-mono text-11 text-faint`}>{s.model}</td>
              <td className={`${TD} text-11 text-faint`}>{formatTime(s.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function RunsTab({ scope }: { scope: Scope }) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRuns(100, scope)
      .then((r) => setRuns(r.runs))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [scope]);

  if (error) return <ErrorNote message={error} />;
  if (runs === null) return <SkeletonRows rows={5} />;
  if (runs.length === 0) {
    return (
      <EmptyNote
        icon={<TreeIcon size={26} />}
        title="No AIDE runs yet"
        hint="Start a run with the AIDE method to see its solution search here."
        action={
          <Link href="/jobs?new=1" className="text-12 text-accent hover:underline">
            Start an AIDE run
          </Link>
        }
      />
    );
  }
  return (
    <TableWrap maxHeight="calc(100vh - 12rem)">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>Run</th>
            <th className={TH}>Nodes</th>
            <th className={TH}>Best metric</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.run_id} className="cursor-pointer bg-panel transition-colors hover:bg-hover" onClick={() => router.push(`/runs/${r.run_id}`)}>
              <td className={TD}>
                <Link href={`/runs/${r.run_id}`} className="font-mono text-12 text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
                  {r.run_id}
                </Link>
              </td>
              <td className={`${TD} font-mono text-11 text-muted`}>{r.nodes ?? "—"}</td>
              <td className={`${TD} font-mono text-11 text-ok`}>{formatMetric(r.best_metric)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function History() {
  const search = useSearchParams();
  const router = useRouter();
  const requested = search.get("tab");
  const tab: TabId = requested === "runs" ? "runs" : "sessions";
  const active = useActiveWorkspace();
  const activeServer = active?.serverId ?? null;
  const [onlyOpen, setOnlyOpen] = useState(false);
  const scope: Scope = onlyOpen && activeServer ? activeServer : null;
  return (
    <PageFrame>
      <div className="mb-3">
        <SectionLabel>History</SectionLabel>
        <p className="mt-0.5 text-12 text-muted">Completed ReAct / Team sessions with their traces, and AIDE solution-search runs.</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs<TabId>
          active={tab}
          onChange={(id) => router.replace(`/history?tab=${id}`)}
          tabs={[
            { id: "sessions", label: "Sessions" },
            { id: "runs", label: "AIDE runs" },
          ]}
        />
        {activeServer && (
          <PillButton size="sm" active={onlyOpen} onClick={() => setOnlyOpen((v) => !v)} className="ml-auto" title={`Show only the workspace "${active?.name}"`}>
            {onlyOpen ? `only "${active?.name}"` : "all workspaces"}
          </PillButton>
        )}
      </div>
      {/* keyed on the scope so a switch starts from the skeleton, not the other scope's rows */}
      {tab === "sessions" ? <SessionsTab key={scope ?? "all"} scope={scope} /> : <RunsTab key={scope ?? "all"} scope={scope} />}
    </PageFrame>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<Loading label="Loading history…" />}>
      <History />
    </Suspense>
  );
}
