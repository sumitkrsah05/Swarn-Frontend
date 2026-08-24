import type { JobStatus, Method } from "@/lib/api";

const STATUS_STYLES: Record<JobStatus, string> = {
  queued: "bg-raised text-muted border-edge",
  running: "bg-accent/10 text-accent border-accent/40",
  complete: "bg-ok/10 text-ok border-ok/40",
  failed: "bg-err/10 text-err border-err/40",
  cancelled: "bg-warn/10 text-warn border-warn/40",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.queued;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs ${style}`}
    >
      {status === "running" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      )}
      {status}
    </span>
  );
}

const METHOD_STYLES: Record<Method, string> = {
  react: "text-accent border-accent/40",
  aide: "text-violet border-violet/40",
  team: "text-ok border-ok/40",
};

export function MethodBadge({ method }: { method: Method }) {
  const style = METHOD_STYLES[method] ?? "text-muted border-edge";
  return (
    <span
      className={`inline-flex rounded border bg-raised/40 px-1.5 py-0.5 font-mono text-[11px] uppercase ${style}`}
    >
      {method}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted justify-center">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-accent" />
      {label ?? "Loading…"}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-edge py-12 text-center">
      <p className="text-sm text-muted">{title}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-err/40 bg-err/5 px-4 py-3 text-sm text-err">
      {message}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
