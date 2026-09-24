"use client";

/** A job status as a coloured dot plus its name (never colour alone). */

const STATUS_DOT: Record<string, { cls: string; label: string }> = {
  queued: { cls: "bg-faint", label: "queued" },
  running: { cls: "bg-accent animate-pulse motion-reduce:animate-none", label: "running" },
  complete: { cls: "bg-ok", label: "complete" },
  failed: { cls: "bg-err", label: "failed" },
  cancelled: { cls: "bg-warn", label: "cancelled" },
};

export function StatusDot({ status }: { status: string }) {
  const s = STATUS_DOT[status] ?? { cls: "bg-faint", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-11 text-muted" title={s.label}>
      <span className={`h-2 w-2 rounded-full ${s.cls}`} aria-hidden />
      {s.label}
    </span>
  );
}
