"use client";

/**
 * Small presentational building blocks for the eval screens. They only use
 * the theme tokens from globals.css so they follow light/dark automatically.
 */

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { JobStatus, RunStatus } from "@/api/types";

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:opacity-90 border border-transparent shadow-sm",
  secondary: "border border-edge bg-panel text-fg hover:bg-hover",
  danger: "border border-err/40 text-err hover:bg-err/10",
  ghost: "text-muted hover:text-fg hover:bg-hover",
};
const SIZE: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
      )}
      {children}
    </button>
  );
}

/** Two-step inline confirmation (no modal): click → "Confirm? yes / no". */
export function ConfirmButton({
  label,
  confirmLabel = "Confirm",
  onConfirm,
  disabled,
  title,
  variant = "danger",
  size = "sm",
  loading,
}: {
  label: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  title?: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          variant={variant}
          size={size}
          loading={loading}
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="ghost" size={size} onClick={() => setArmed(false)}>
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <Button
      variant={variant === "danger" ? "ghost" : variant}
      size={size}
      disabled={disabled}
      title={title}
      onClick={() => setArmed(true)}
      className={variant === "danger" ? "text-err hover:bg-err/10" : ""}
    >
      {label}
    </Button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded border border-edge bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted hover:text-fg"
    >
      {done ? "copied" : label}
    </button>
  );
}

// ------------------------------------------------------------------- badges

export type Tone = "neutral" | "ok" | "warn" | "err" | "accent" | "violet";

const TONE: Record<Tone, string> = {
  neutral: "bg-raised text-muted border-edge",
  ok: "bg-ok/10 text-ok border-ok/40",
  warn: "bg-warn/10 text-warn border-warn/40",
  err: "bg-err/10 text-err border-err/40",
  accent: "bg-accent/10 text-accent border-accent/40",
  violet: "bg-violet/10 text-violet border-violet/40",
};

export function Badge({
  tone = "neutral",
  children,
  pulse,
  title,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  pulse?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] ${TONE[tone]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

const JOB_TONE: Record<JobStatus, Tone> = {
  queued: "neutral",
  running: "accent",
  complete: "ok",
  failed: "err",
  cancelled: "warn",
};

export function JobStatusBadge({ status }: { status: JobStatus | string }) {
  const tone = JOB_TONE[status as JobStatus] ?? "neutral";
  return (
    <Badge tone={tone} pulse={status === "running"}>
      {status}
    </Badge>
  );
}

const RUN_TONE: Record<RunStatus, Tone> = {
  complete: "ok",
  incomplete: "warn",
  empty: "neutral",
};

export function RunStatusBadge({ status }: { status: RunStatus | string }) {
  return <Badge tone={RUN_TONE[status as RunStatus] ?? "neutral"}>{status}</Badge>;
}

export function GatesBadge({
  passed,
  large,
}: {
  passed: boolean | null | undefined;
  large?: boolean;
}) {
  const tone: Tone = passed === true ? "ok" : passed === false ? "err" : "neutral";
  const text = passed === true ? "gates passed" : passed === false ? "gates failed" : "gates n.a.";
  return (
    <Badge tone={tone} className={large ? "px-3 py-1 text-sm" : ""}>
      {text}
    </Badge>
  );
}

export function PassBadge({ passed }: { passed: boolean | null | undefined }) {
  if (passed == null) return <Badge tone="neutral">n.a.</Badge>;
  return <Badge tone={passed ? "ok" : "err"}>{passed ? "pass" : "fail"}</Badge>;
}

// ---------------------------------------------------------- layout blocks

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  tone,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  const border =
    tone === "ok"
      ? "border-ok/40"
      : tone === "err"
        ? "border-err/40"
        : tone === "warn"
          ? "border-warn/40"
          : "border-edge";
  return (
    <section className={`min-w-0 rounded-lg border ${border} bg-panel ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Banner({
  tone = "warn",
  title,
  children,
  className = "",
  "data-testid": testId,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const styles: Record<Tone, string> = {
    neutral: "border-edge bg-raised text-fg",
    ok: "border-ok/40 bg-ok/5 text-ok",
    warn: "border-warn/40 bg-warn/5 text-warn",
    err: "border-err/40 bg-err/5 text-err",
    accent: "border-accent/40 bg-accent/5 text-accent",
    violet: "border-violet/40 bg-violet/5 text-violet",
  };
  return (
    <div
      role={tone === "err" ? "alert" : "status"}
      data-testid={testId}
      className={`rounded-lg border px-4 py-3 text-sm ${styles[tone]} ${className}`}
    >
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? "mt-1 text-fg/90" : ""}>{children}</div>}
    </div>
  );
}

export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={`group rounded-lg border border-edge bg-panel ${className}`}
    >
      <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-fg marker:text-faint">
        {summary}
      </summary>
      <div className="border-t border-edge px-4 py-3">{children}</div>
    </details>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; hidden?: boolean }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-1 overflow-x-auto border-b border-edge"
    >
      {tabs
        .filter((t) => !t.hidden)
        .map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => onChange(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              active === t.id
                ? "border-accent font-medium text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
    </div>
  );
}

/** Every table scrolls inside its own box; the page never scrolls sideways. */
export function TableWrap({
  children,
  maxHeight = "28rem",
  className = "",
}: {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 overflow-auto rounded-lg border border-edge ${className}`}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}

export const TABLE = "w-full min-w-max border-collapse text-sm";
export const TH =
  "sticky top-0 z-10 whitespace-nowrap border-b border-edge bg-raised px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
export const TD = "whitespace-nowrap border-b border-edge px-3 py-2 align-top";

export function KeyValue({
  items,
  className = "",
}: {
  items: { k: ReactNode; v: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="whitespace-nowrap font-mono text-xs text-muted">{it.k}</dt>
          <dd className="min-w-0 break-words text-fg">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------ forms

export function Field({
  label,
  hint,
  children,
  htmlFor,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

const CONTROL =
  "w-full rounded-md border border-edge bg-panel px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`${CONTROL} ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${CONTROL} font-mono ${className}`} {...rest} />;
}

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-accent"
      />
      <label htmlFor={id} className="text-sm text-fg">
        {label}
        {hint && <span className="block text-[11px] text-faint">{hint}</span>}
      </label>
    </div>
  );
}

// -------------------------------------------------------- long-text block

/** Scrollable, monospace, whitespace-preserving text with a copy button. */
export function TextBlock({
  text,
  label,
  maxHeight = "16rem",
  className = "",
}: {
  text: string | null | undefined;
  label?: ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  const value = text ?? "";
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        <CopyButton text={value} />
      </div>
      <pre
        className="overflow-auto whitespace-pre-wrap break-words rounded-md border border-edge bg-raised/60 p-3 font-mono text-xs leading-relaxed text-fg"
        style={{ maxHeight }}
      >
        {value === "" ? <span className="text-faint">(empty)</span> : value}
      </pre>
    </div>
  );
}

// ------------------------------------------------------------------ drawer

/** Right-hand drawer; Esc or the backdrop closes it. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "min(56rem, 92vw)",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="relative flex h-full flex-col border-l border-edge bg-panel shadow-2xl"
        style={{ width }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0 truncate text-sm font-semibold text-fg">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Esc ✕
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------- data states

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-accent" />
      {label}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-edge py-10 text-center">
      <p className="text-sm text-muted">{title}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return <Banner tone="err">{message}</Banner>;
}

// ------------------------------------------------------------ metric bar

/** mean with its 95% CI as text and as a 0–1 horizontal bar. */
export function MetricBar({
  mean,
  lo,
  hi,
  threshold,
}: {
  mean: number | null | undefined;
  lo: number | null | undefined;
  hi: number | null | undefined;
  threshold?: number | null;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const m = mean != null ? clamp(mean) : null;
  const l = lo != null ? clamp(lo) : m;
  const h = hi != null ? clamp(hi) : m;
  return (
    <div className="relative h-2.5 w-28 rounded-sm bg-raised" aria-hidden>
      {l != null && h != null && (
        <div
          className="absolute top-0 h-full rounded-sm bg-accent/30"
          style={{ left: `${l * 100}%`, width: `${Math.max(1, (h - l) * 100)}%` }}
        />
      )}
      {m != null && (
        <div
          className="absolute top-0 h-full w-0.5 bg-accent"
          style={{ left: `calc(${m * 100}% - 1px)` }}
        />
      )}
      {threshold != null && threshold >= 0 && threshold <= 1 && (
        <div
          className="absolute -top-0.5 h-3.5 w-px bg-warn"
          style={{ left: `${threshold * 100}%` }}
          title={`gate ${threshold}`}
        />
      )}
    </div>
  );
}

export function Elapsed({
  from,
  to,
}: {
  from: number | null | undefined;
  to?: number | null;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (from == null || to != null) return;
    const tick = () => setNow(Date.now() / 1000);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [from, to]);
  if (from == null) return <span>—</span>;
  const end = to ?? now;
  if (end == null) return <span className="font-mono tabular-nums">0m 00s</span>;
  const s = Math.max(0, Math.floor(end - from));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="font-mono tabular-nums">
      {h > 0 ? `${h}h ` : ""}
      {m}m {sec.toString().padStart(2, "0")}s
    </span>
  );
}
