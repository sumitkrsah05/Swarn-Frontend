"use client";

import type { RunSummary } from "@/api/types";
import { fmtCi, fmtInt, fmtNum, orderCandidates } from "@/lib/evals";
import { Card, Empty, TABLE, TD, TH, TableWrap } from "./primitives";

/** value × metric tables, one per (candidate, metadata field). */
export function RunSlices({ summary }: { summary: RunSummary | null }) {
  const names = orderCandidates(Object.keys(summary?.candidates ?? {}));
  const blocks: { candidate: string; field: string }[] = [];
  for (const n of names) {
    for (const field of Object.keys(summary?.candidates[n]?.slices ?? {})) {
      blocks.push({ candidate: n, field });
    }
  }
  if (blocks.length === 0) {
    return (
      <Empty
        title="No slices"
        hint="Add metadata fields under reporting.slice_by (and dataset.field_mapping.metadata_fields) to break results down."
      />
    );
  }
  return (
    <div className="space-y-4">
      {blocks.map(({ candidate, field }) => {
        const byValue = summary!.candidates[candidate].slices[field];
        const values = Object.keys(byValue);
        const metrics = Array.from(
          new Set(values.flatMap((v) => Object.keys(byValue[v] ?? {}))),
        );
        return (
          <Card
            key={`${candidate}/${field}`}
            title={
              <span>
                <span className="font-mono">{candidate}</span>
                <span className="text-muted"> · sliced by </span>
                <span className="font-mono">{field}</span>
              </span>
            }
          >
            <TableWrap maxHeight="24rem">
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th className={TH}>{field}</th>
                    {metrics.map((m) => (
                      <th key={m} className={TH}>
                        {m} · mean [95% CI] · n
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {values.map((v) => (
                    <tr key={v} className="bg-panel">
                      <td className={`${TD} font-mono text-xs`}>{v}</td>
                      {metrics.map((m) => {
                        const cell = byValue[v]?.[m];
                        return (
                          <td key={m} className={`${TD} font-mono text-xs`}>
                            {cell ? (
                              <>
                                <span className="text-fg">{fmtNum(cell.mean)}</span>{" "}
                                <span className="text-muted">
                                  {fmtCi(cell.ci95_low, cell.ci95_high)}
                                </span>{" "}
                                <span className="text-faint">n={fmtInt(cell.n)}</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        );
      })}
    </div>
  );
}
