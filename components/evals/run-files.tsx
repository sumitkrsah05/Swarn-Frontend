"use client";

import { runFileUrl } from "@/api/client";
import { useRunFiles } from "@/hooks/useEvalData";
import { formatBytes } from "@/lib/format";
import { errorMessage } from "@/lib/evals";
import { Empty, InlineError, Loading, TABLE, TD, TH, TableWrap } from "@/components/ui";

export function RunFiles({ runId }: { runId: string }) {
  const files = useRunFiles(runId);
  if (files.isError) return <InlineError message={errorMessage(files.error)} />;
  if (files.isPending) return <Loading label="Loading files…" />;
  const list = files.data.files ?? [];
  if (list.length === 0) return <Empty title="No files in this run directory" />;
  return (
    <TableWrap maxHeight="calc(100vh - 16rem)">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>Path</th>
            <th className={TH}>Size</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f) => (
            <tr key={f.path} className="bg-panel hover:bg-hover">
              <td className={TD}>
                <a
                  href={runFileUrl(runId, f.path)}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {f.path}
                </a>
              </td>
              <td className={`${TD} font-mono text-xs text-muted`}>{formatBytes(f.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
