"use client";

import type { ComparisonMetric, RunSummary } from "@/api/types";
import { fmtCi, fmtInt, fmtNum } from "@/lib/evals";
import { Badge, Card, Empty, TABLE, TD, TH, TableWrap, type Tone } from "@/components/ui";

export function verdictTone(verdict: string | null | undefined): Tone {
  const v = (verdict ?? "").toLowerCase();
  if (/regress|worse|fail|drop/.test(v)) return "err";
  if (/improv|better|pass|win/.test(v)) return "ok";
  if (/inconclusive|tie|no.?diff|same|equiv/.test(v)) return "neutral";
  return "accent";
}

function fmtP(p: number | null | undefined) {
  if (p == null || !isFinite(p)) return "—";
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}

export function ComparisonRows({
  rows,
}: {
  rows: { key: string; label: string; m: ComparisonMetric }[];
}) {
  return (
    <TableWrap maxHeight="24rem">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>Metric</th>
            <th className={TH}>Delta</th>
            <th className={TH}>95% CI</th>
            <th className={TH}>Test</th>
            <th className={TH}>p</th>
            <th className={TH}>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, m }) => (
            <tr key={key} className="bg-panel">
              <td className={`${TD} font-mono text-xs`}>{label}</td>
              <td className={`${TD} font-mono text-xs ${m.delta != null && m.delta < 0 ? "text-err" : m.delta != null && m.delta > 0 ? "text-ok" : ""}`}>
                {m.delta != null && m.delta > 0 ? "+" : ""}
                {fmtNum(m.delta)}
              </td>
              <td className={`${TD} font-mono text-xs text-muted`}>
                {m.ci ? fmtCi(m.ci[0], m.ci[1]) : "—"}
              </td>
              <td className={`${TD} font-mono text-xs text-muted`}>{m.test ?? "—"}</td>
              <td className={`${TD} font-mono text-xs`}>{fmtP(m.p)}</td>
              <td className={TD}>
                <Badge tone={verdictTone(m.verdict)}>{m.verdict || "—"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function RunComparisons({ summary }: { summary: RunSummary | null }) {
  const comps = summary?.comparisons ?? [];
  if (comps.length === 0) {
    return (
      <Empty
        title="No within-run comparisons"
        hint="Comparisons appear when a run has two or more candidates scored on shared samples."
      />
    );
  }
  return (
    <div className="space-y-4">
      {comps.map((c, i) => (
        <Card
          key={i}
          title={
            <span className="font-mono">
              {c.a} <span className="text-muted">vs</span> {c.b}
            </span>
          }
          subtitle={`${fmtInt(c.n_shared)} shared samples`}
        >
          <ComparisonRows
            rows={Object.entries(c.metrics).map(([metric, m]) => ({
              key: metric,
              label: metric,
              m,
            }))}
          />
        </Card>
      ))}
    </div>
  );
}
