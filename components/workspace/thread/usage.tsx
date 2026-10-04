"use client";

/**
 * The token counter next to a turn: `↑12.4k ↓1.2k`, ticking while the reply
 * streams (the dot breathes and the output figure includes the in-flight
 * estimate), settling to the final numbers when the job ends. The same
 * element serves the thinking banner, the composer's working overlay and the
 * answer header, so the figure reads the same everywhere.
 */

import type { TurnUsage } from "@/lib/workspace";
import { formatTokens } from "@/lib/format";

export function usageTitle(u: TurnUsage): string {
  const out = u.outputTokens + u.inFlight;
  const parts = [`${u.inputTokens.toLocaleString()} input tokens`, `${out.toLocaleString()} output tokens${u.inFlight ? " (streaming, estimated)" : ""}`, `${u.calls} model call${u.calls === 1 ? "" : "s"}`];
  if (u.cost != null) parts.push(`${u.currency ?? ""} ${u.cost.toFixed(4)}`.trim());
  return parts.join(" · ");
}

export function TokenCounter({ usage, detail = false, className = "" }: { usage: TurnUsage | undefined; detail?: boolean; className?: string }) {
  if (!usage || (!usage.calls && !usage.inFlight)) return null;
  const live = usage.inFlight > 0;
  const out = usage.outputTokens + usage.inFlight;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-10 not-italic tabular-nums text-faint ${className}`} title={usageTitle(usage)} data-testid="tokens">
      {live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent animate-breathe motion-reduce:animate-none" aria-hidden />}
      <span>
        ↑{formatTokens(usage.inputTokens)} ↓{formatTokens(out)}
        {live && "…"}
      </span>
      {detail && (
        <span className="text-faint/80">
          · {usage.calls} call{usage.calls === 1 ? "" : "s"}
          {usage.cost != null && ` · ${usage.currency ?? ""} ${usage.cost.toFixed(4)}`.replace("  ", " ")}
        </span>
      )}
    </span>
  );
}
