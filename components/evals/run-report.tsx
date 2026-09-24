"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rebuildReport, reportUrl } from "@/api/client";
import type { RunDetail } from "@/api/types";
import { evalKeys } from "@/hooks/useEvalData";
import { useToast } from "@/components/toast";
import { errorMessage } from "@/lib/evals";
import { Button, Empty } from "@/components/ui";

export function RunReport({ run }: { run: RunDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nonce, setNonce] = useState(0);
  const available = run.status === "complete" || run.artifacts?.["report.html"];

  const rebuild = useMutation({
    mutationFn: () => rebuildReport(run.run_id),
    onSuccess: () => {
      toast("success", "Report regenerated");
      setNonce((n) => n + 1);
      void qc.invalidateQueries({ queryKey: evalKeys.run(run.run_id) });
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={reportUrl(run.run_id, "md")}
          target="_blank"
          rel="noreferrer"
          className={`rounded-md border border-edge px-3 py-1.5 text-sm hover:bg-hover ${available ? "text-fg" : "pointer-events-none opacity-50"}`}
        >
          Download markdown
        </a>
        <a
          href={reportUrl(run.run_id, "html")}
          target="_blank"
          rel="noreferrer"
          className={`rounded-md border border-edge px-3 py-1.5 text-sm hover:bg-hover ${available ? "text-fg" : "pointer-events-none opacity-50"}`}
        >
          Open HTML in new tab
        </a>
        <Button variant="secondary" loading={rebuild.isPending} onClick={() => rebuild.mutate()}>
          Regenerate
        </Button>
        <span className="text-xs text-faint">rebuilds summary.json and both report formats</span>
      </div>

      {!available ? (
        <Empty
          title="Report not available yet"
          hint="The server renders report.html once the run completes (404 until then). Use Regenerate after resuming an incomplete run."
        />
      ) : (
        <iframe
          key={nonce}
          title="Evaluation report"
          sandbox=""
          src={`${reportUrl(run.run_id, "html")}&v=${nonce}`}
          className="h-[calc(100vh-16rem)] min-h-[32rem] w-full rounded-lg border border-edge bg-white"
        />
      )}
    </div>
  );
}
