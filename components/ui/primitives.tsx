"use client";

/**
 * The application's design system. Every screen builds from these pieces so
 * spacing, colour, focus behaviour and states stay identical across the
 * dashboard and the evaluation section.
 *
 * Colours come from the theme tokens in app/globals.css, so all of this
 * follows light and dark automatically.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Group,
  Panel,
  Separator,
  useGroupRef,
  usePanelRef,
  type Layout,
} from "react-resizable-panels";
import { CheckIcon, CloseIcon, CopyIcon } from "./icons";

/** Shared focus treatment; applied to everything interactive. */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// ------------------------------------------------------------------ buttons

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "border border-transparent bg-accent text-on-accent shadow-sm hover:bg-accent/90 active:bg-accent/95",
  secondary: "border border-edge bg-panel text-fg hover:bg-hover hover:border-faint/60",
  danger: "border border-err/40 bg-transparent text-err hover:bg-err/10",
  ghost: "border border-transparent text-muted hover:bg-hover hover:text-fg",
};
const SIZE: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-9 gap-2 px-3.5 text-sm",
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
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70" />
      )}
      {children}
    </button>
  );
}

/** Two-step inline confirmation, so a destructive action never needs a modal. */
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
          autoFocus
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
      className={variant === "danger" ? "text-err hover:bg-err/10 hover:text-err" : ""}
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
      /* clipboard unavailable (insecure origin / denied) */
    }
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? "Copied" : label}
      className={`inline-flex items-center gap-1 rounded border border-edge bg-panel px-1.5 py-0.5 font-mono text-[10px] text-muted transition-colors hover:text-fg ${FOCUS}`}
    >
      {done ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
      {done ? "copied" : label}
    </button>
  );
}

// ------------------------------------------------------------------- badges

export type Tone = "neutral" | "ok" | "warn" | "err" | "accent" | "violet";

const TONE: Record<Tone, string> = {
  neutral: "border-edge bg-raised text-muted",
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  err: "border-err/40 bg-err/10 text-err",
  accent: "border-accent/40 bg-accent/10 text-accent",
  violet: "border-violet/40 bg-violet/10 text-violet",
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] leading-5 ${TONE[tone]} ${className}`}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

const JOB_TONE: Record<string, Tone> = {
  queued: "neutral",
  running: "accent",
  complete: "ok",
  failed: "err",
  cancelled: "warn",
  idle: "neutral",
};

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={JOB_TONE[status] ?? "neutral"} pulse={status === "running"}>
      {status}
    </Badge>
  );
}

/** Legacy alias used by the dashboard pages. */
export const StatusBadge = JobStatusBadge;

const METHOD_TONE: Record<string, Tone> = {
  react: "accent",
  aide: "violet",
  team: "ok",
  eval: "warn",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <Badge tone={METHOD_TONE[method] ?? "neutral"} className="uppercase">
      {method}
    </Badge>
  );
}

const RUN_TONE: Record<string, Tone> = {
  complete: "ok",
  incomplete: "warn",
  empty: "neutral",
};

export function RunStatusBadge({ status }: { status: string }) {
  return <Badge tone={RUN_TONE[status] ?? "neutral"}>{status}</Badge>;
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

// ------------------------------------------------------------ layout blocks

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: ReactNode; href?: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-faint">/</span>}
              {c.href ? (
                <a href={c.href} className={`rounded text-muted hover:text-fg ${FOCUS}`}>
                  {c.label}
                </a>
              ) : (
                <span className="text-fg">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && (
            <div className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "p-4",
  tone,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
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
    <section className={`min-w-0 rounded-xl border ${border} bg-panel shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-edge px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {subtitle && <div className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
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
      className={`group rounded-xl border border-edge bg-panel shadow-sm ${className}`}
    >
      <summary
        className={`cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium text-fg ${FOCUS}`}
      >
        <span className="flex items-center gap-2">
          <span className="text-faint transition-transform group-open:rotate-90" aria-hidden>
            ›
          </span>
          {summary}
        </span>
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
  const visible = tabs.filter((t) => !t.hidden);
  return (
    <div role="tablist" className="-mx-1 flex gap-1 overflow-x-auto border-b border-edge px-1">
      {visible.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${FOCUS} ${
            active === t.id
              ? "border-accent font-medium text-fg"
              : "border-transparent text-muted hover:border-edge hover:text-fg"
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
      className={`min-w-0 overflow-auto rounded-panel border border-edge bg-panel ${className}`}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}

export const TABLE = "w-full min-w-max border-collapse text-sm";
export const TH =
  "sticky top-0 z-10 whitespace-nowrap border-b border-edge bg-raised px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-muted uppercase";
export const TD = "whitespace-nowrap border-b border-edge px-3 py-2 align-top";
/** Row class for clickable/hoverable table rows. */
export const TR = "bg-panel transition-colors hover:bg-hover";

/**
 * Width-constrained content inside a table cell.
 *
 * A `max-width` on a `<td>` does not constrain a `min-w-max` table: the
 * browser sizes columns from the content's max-content width and the text
 * then overflows across neighbouring cells. Putting the constraint on a
 * block *inside* the cell caps that contribution, so the column stays put.
 */
export function CellText({
  children,
  width = "22rem",
  mode = "truncate",
  title,
  className = "",
}: {
  children: ReactNode;
  width?: string;
  /** truncate: one line with an ellipsis · wrap: normal wrapping · pre: keeps whitespace */
  mode?: "truncate" | "wrap" | "pre";
  title?: string;
  className?: string;
}) {
  const whitespace =
    mode === "truncate"
      ? "truncate"
      : mode === "pre"
        ? "break-words whitespace-pre-wrap"
        : "break-words whitespace-normal";
  return (
    <div title={title} style={{ maxWidth: width }} className={`${whitespace} ${className}`}>
      {children}
    </div>
  );
}

export function KeyValue({
  items,
  className = "",
}: {
  items: { k: ReactNode; v: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="whitespace-nowrap font-mono text-xs text-muted">{it.k}</dt>
          <dd className="min-w-0 break-words text-fg">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

// -------------------------------------------------------------------- forms

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
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-faint">{hint}</p>}
    </div>
  );
}

const CONTROL =
  "w-full rounded-md border border-edge bg-panel px-2.5 py-1.5 text-sm text-fg transition-colors placeholder:text-faint hover:border-faint/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50";

export function Input(props: ComponentProps<"input">) {
  const { className = "", ...rest } = props;
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Select(props: ComponentProps<"select">) {
  const { className = "", ...rest } = props;
  return <select className={`${CONTROL} ${className}`} {...rest} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
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
        className={`mt-0.5 h-4 w-4 shrink-0 accent-accent ${FOCUS}`}
      />
      <label htmlFor={id} className="text-sm text-fg">
        {label}
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">{hint}</span>}
      </label>
    </div>
  );
}

// ---------------------------------------------------------- long-text block

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
        <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
        <CopyButton text={value} />
      </div>
      <pre
        className="overflow-auto rounded-md border border-edge bg-raised/60 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fg"
        style={{ maxHeight }}
      >
        {value === "" ? <span className="text-faint">(empty)</span> : value}
      </pre>
    </div>
  );
}

// ------------------------------------------------------------------- drawer

/** Right-hand drawer. Esc or the backdrop closes it; focus is managed. */
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
  const panel = useRef<HTMLElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="relative flex h-full flex-col border-l border-edge bg-panel shadow-2xl outline-none"
        style={{ width }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
          <div className="min-w-0 truncate text-sm font-semibold text-fg">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close (Esc)">
            <CloseIcon size={14} />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

// -------------------------------------------------------------- data states

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-accent motion-reduce:animate-none" />
      {label}
    </div>
  );
}

/** Legacy alias used by the dashboard pages. */
export const Spinner = Loading;

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-raised motion-reduce:animate-none ${className}`}
    />
  );
}

/** Placeholder rows for a list or table that is still loading. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-px overflow-hidden rounded-xl border border-edge">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 bg-panel px-4 py-3.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-edge px-6 py-12 text-center">
      {icon && <div className="mb-3 flex justify-center text-faint">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Legacy alias used by the dashboard pages. */
export const EmptyState = Empty;

export function InlineError({ message }: { message: string }) {
  return <Banner tone="err">{message}</Banner>;
}

/** Legacy alias used by the dashboard pages. */
export function ErrorNote({ message }: { message: string }) {
  return <InlineError message={message} />;
}

// -------------------------------------------------------------- metric bar

/** mean with its 95% CI as a 0–1 horizontal bar. */
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
        <div className="absolute top-0 h-full w-0.5 bg-accent" style={{ left: `calc(${m * 100}% - 1px)` }} />
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

/** Live-updating elapsed timer; freezes once `to` is set. */
export function Elapsed({ from, to }: { from: number | null | undefined; to?: number | null }) {
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

// =====================================================================
// Workspace-era primitives (docs/guide.md §9). Screens compose these and
// never hand-roll the styles they encode.
// =====================================================================

// -------------------------------------------------------------- icon button

/** Icon-only button. `label` is required: it is the aria-label and the tooltip. */
export function IconButton({
  label,
  size = 28,
  active,
  tone = "default",
  className = "",
  children,
  title,
  type = "button",
  ...rest
}: ComponentProps<"button"> & {
  label: string;
  size?: number;
  active?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-muted hover:bg-err-tint hover:text-err"
      : tone === "primary"
        ? "text-accent hover:bg-accent-tint"
        : "text-muted hover:bg-hover hover:text-fg";
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-accent-tint text-accent" : toneClass
      } ${FOCUS} ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
}

// -------------------------------------------------------------------- pills

const PILL_BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-canvas border border-edge bg-panel text-12 text-fg shadow-hair";
const PILL_SIZE = { sm: "h-6 px-2", md: "h-7 px-2.5" } as const;

/** Static pill (paper background, hairline border, small shadow). */
export function Pill({
  children,
  className = "",
  size = "md",
  title,
}: {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
  title?: string;
}) {
  return (
    <span title={title} className={`${PILL_BASE} ${PILL_SIZE[size]} ${className}`}>
      {children}
    </span>
  );
}

/** Pill-shaped button; primary on hover, tinted when active. */
export function PillButton({
  active,
  size = "md",
  className = "",
  children,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { active?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={`${PILL_BASE} ${PILL_SIZE[size]} cursor-pointer transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45 ${
        active ? "border-accent bg-accent-tint text-accent" : ""
      } ${FOCUS} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------ section label

/** "DATA SOURCES", "THREAD 2", "RECENT": uppercase, bold, 11px, 0.04em. */
export function SectionLabel({
  children,
  className = "",
  tone = "muted",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  tone?: "muted" | "accent" | "fg";
  as?: "div" | "h1" | "h2" | "h3" | "span";
}) {
  const color =
    tone === "accent" ? "text-accent" : tone === "fg" ? "text-fg" : "text-muted";
  return (
    <Tag className={`text-11 font-bold tracking-[0.04em] uppercase ${color} ${className}`}>
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------- tint card

/** Semantic colour roles (§2.7). */
export type Role = "data" | "user" | "report" | "ask" | "grey" | "ok" | "warn" | "err" | "none";

const ROLE_BG: Record<Role, string> = {
  data: "bg-accent-tint",
  user: "bg-user-tint",
  report: "bg-report-tint",
  ask: "bg-ask-tint",
  grey: "bg-grey-tint",
  ok: "bg-ok-tint",
  warn: "bg-warn-tint",
  err: "bg-err-tint",
  none: "bg-panel",
};

const RADIUS: Record<"chip" | "card" | "panel" | "composer" | "canvas", string> = {
  chip: "rounded-chip",
  card: "rounded-card",
  panel: "rounded-panel",
  composer: "rounded-composer",
  canvas: "rounded-canvas",
};

/**
 * Flat tinted card: a 10% role tint, hairline border, no elevation.
 * `focused` draws the 2px primary ring; `lineage` the 2px primary left edge.
 */
export function TintCard({
  role = "grey",
  radius = "card",
  border = true,
  focused,
  lineage,
  lift,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  role?: Role;
  radius?: keyof typeof RADIUS;
  border?: boolean;
  focused?: boolean;
  lineage?: boolean;
  lift?: boolean;
}) {
  return (
    <div
      className={`min-w-0 ${ROLE_BG[role]} ${RADIUS[radius]} ${border ? "border border-edge" : ""} ${
        focused ? "ring-2 ring-accent ring-offset-0" : ""
      } ${lineage && !focused ? "border-l-2 border-l-accent" : ""} ${lift ? "lift-1" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

// --------------------------------------------------------------- gutter row

/**
 * One thread row: a 14px gutter (2px connector + a small type icon), then the
 * content. The connector is primary when the row is on the focused lineage.
 */
export function GutterRow({
  icon,
  lineage,
  top = true,
  bottom = true,
  iconTone = "muted",
  className = "",
  children,
}: {
  icon: ReactNode;
  lineage?: boolean;
  /** draw the connector above the icon */
  top?: boolean;
  /** draw the connector below the icon */
  bottom?: boolean;
  iconTone?: "muted" | "accent" | "user" | "report" | "ask" | "err" | "warn";
  className?: string;
  children: ReactNode;
}) {
  const line = lineage ? "bg-accent" : "bg-edge";
  const tone: Record<NonNullable<typeof iconTone>, string> = {
    muted: "text-muted",
    accent: "text-accent",
    user: "text-user",
    report: "text-report",
    ask: "text-ask",
    err: "text-err",
    warn: "text-warn",
  };
  return (
    <div className={`relative flex gap-1.5 ${className}`}>
      <div className="relative w-[14px] shrink-0" aria-hidden>
        {top && (
          <span className={`absolute left-1/2 top-0 h-[14px] w-0.5 -translate-x-1/2 ${line}`} />
        )}
        {bottom && (
          <span className={`absolute left-1/2 top-[14px] bottom-0 w-0.5 -translate-x-1/2 ${line}`} />
        )}
        <span
          className={`absolute left-1/2 top-[6px] flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full bg-bg ${tone[iconTone]}`}
        >
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ shimmer

/** The active thinking step: a 2s left-to-right sweep across the text. */
export function Shimmer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`shimmer-text ${className}`}>{children}</span>;
}

// ---------------------------------------------------------------- unread dot

/** A 6px pulsing amber dot (1.6s) shown until an item is first focused. */
export function UnreadDot({ className = "", label = "unread" }: { className?: string; label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ask animate-unread motion-reduce:animate-none ${className}`}
    />
  );
}

// ------------------------------------------------------------------- popover

export type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end" | "right-start" | "left-start";

function positionFor(anchor: DOMRect, pop: { width: number; height: number }, placement: Placement, offset: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = 0;
  let left = 0;
  let p = placement;
  // flip vertically / horizontally when the preferred side has no room
  if ((p === "bottom-start" || p === "bottom-end") && anchor.bottom + offset + pop.height > vh && anchor.top - offset - pop.height > 0) {
    p = p === "bottom-start" ? "top-start" : "top-end";
  } else if ((p === "top-start" || p === "top-end") && anchor.top - offset - pop.height < 0) {
    p = p === "top-start" ? "bottom-start" : "bottom-end";
  } else if (p === "right-start" && anchor.right + offset + pop.width > vw) {
    p = "left-start";
  }
  switch (p) {
    case "bottom-start":
      top = anchor.bottom + offset;
      left = anchor.left;
      break;
    case "bottom-end":
      top = anchor.bottom + offset;
      left = anchor.right - pop.width;
      break;
    case "top-start":
      top = anchor.top - offset - pop.height;
      left = anchor.left;
      break;
    case "top-end":
      top = anchor.top - offset - pop.height;
      left = anchor.right - pop.width;
      break;
    case "right-start":
      top = anchor.top;
      left = anchor.right + offset;
      break;
    case "left-start":
      top = anchor.top;
      left = anchor.left - offset - pop.width;
      break;
  }
  left = Math.max(8, Math.min(left, vw - pop.width - 8));
  top = Math.max(8, Math.min(top, vh - pop.height - 8));
  return { top, left };
}

/**
 * Non-modal anchored popover rendered in a portal. Click-away and Esc close
 * it; it flips when the preferred side has no room.
 */
export function Popover({
  anchor,
  open,
  onClose,
  placement = "bottom-start",
  offset = 6,
  width,
  className = "",
  role = "dialog",
  label,
  children,
  initialFocus = true,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  offset?: number;
  width?: number | string;
  className?: string;
  role?: "dialog" | "menu" | "listbox" | "presentation";
  label?: string;
  children: ReactNode;
  /** move focus into the popover when it opens */
  initialFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = ref.current;
      if (!el || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const box = { width: el.offsetWidth, height: el.offsetHeight };
      setPos(positionFor(rect, box, placement, offset));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, placement, offset, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor?.focus?.();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    if (initialFocus) {
      const first = ref.current?.querySelector<HTMLElement>(
        "input,button,[tabindex]:not([tabindex='-1']),textarea,select,a[href]",
      );
      (first ?? ref.current)?.focus?.();
    }
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchor, initialFocus]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      tabIndex={-1}
      className={`fixed z-[70] rounded-pop border border-edge bg-panel text-fg shadow-pop outline-none animate-fade-in-fast ${className}`}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------- menu

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  external?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** render a hairline above this item */
  separator?: boolean;
}

/** Keyboard-navigable dropdown built on Popover. */
export function Menu({
  anchor,
  open,
  onClose,
  items,
  placement = "bottom-end",
  label = "Menu",
  width = 200,
}: {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  items: MenuItem[];
  placement?: Placement;
  label?: string;
  width?: number;
}) {
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])"),
    );
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next].focus();
  };
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} placement={placement} role="menu" label={label} width={width}>
      <div className="p-1" onKeyDown={onKey}>
        {items.map((it, i) => {
          const cls = `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors ${
            it.disabled
              ? "cursor-not-allowed text-faint"
              : it.danger
                ? "text-err hover:bg-err-tint"
                : "text-fg hover:bg-hover"
          } ${FOCUS}`;
          const body = (
            <>
              {it.icon && <span className="shrink-0 text-muted">{it.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
            </>
          );
          return (
            <div key={i} className={it.separator ? "mt-1 border-t border-edge pt-1" : ""}>
              {it.href ? (
                <a
                  role="menuitem"
                  href={it.href}
                  target={it.external ? "_blank" : undefined}
                  rel={it.external ? "noreferrer" : undefined}
                  className={cls}
                  onClick={onClose}
                  aria-disabled={it.disabled || undefined}
                >
                  {body}
                </a>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={cls}
                  disabled={it.disabled}
                  aria-disabled={it.disabled || undefined}
                  onClick={() => {
                    onClose();
                    it.onSelect?.();
                  }}
                >
                  {body}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Popover>
  );
}

// -------------------------------------------------------------------- dialog

/** Modal dialog. Esc / backdrop close it; focus is moved in and restored. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  width = "min(40rem, 92vw)",
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      "input,button:not([data-dialog-close]),[tabindex]:not([tabindex='-1']),textarea,select",
    );
    (first ?? panel.current)?.focus?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`relative flex max-h-[90vh] flex-col rounded-canvas border border-edge bg-panel shadow-pop outline-none animate-fade-in-fast ${className}`}
        style={{ width }}
      >
        {(
          <header className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
            <h2 id={titleId} className="min-w-0 truncate text-14 font-semibold text-fg">
              {title}
            </h2>
            <IconButton label="Close (Esc)" onClick={onClose} data-dialog-close size={26}>
              <CloseIcon size={14} />
            </IconButton>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-edge px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- split pane

/**
 * Two-pane horizontal split (react-resizable-panels). `snapLeft` snaps the
 * left pane's pixel width after every user drag (§2.2: whole card columns).
 * Closing the right pane collapses it over 140ms and lets the left fill.
 */
export function SplitPane({
  left,
  right,
  rightOpen,
  leftMin = 280,
  rightMin = 500,
  defaultLeftPx,
  snapLeft,
  onLeftWidth,
  className = "",
}: {
  left: ReactNode;
  right: ReactNode;
  rightOpen: boolean;
  leftMin?: number;
  rightMin?: number;
  /** initial left width in px (percent is derived on mount) */
  defaultLeftPx?: number;
  /** returns the snapped px width for a requested one, given the total width */
  snapLeft?: (px: number, total: number) => number;
  onLeftWidth?: (px: number) => void;
  className?: string;
}) {
  const groupRef = useGroupRef();
  const rightRef = usePanelRef();
  const elRef = useRef<HTMLDivElement | null>(null);
  const [animating, setAnimating] = useState(false);
  const snapRef = useRef(snapLeft);
  const widthRef = useRef(onLeftWidth);
  useEffect(() => {
    snapRef.current = snapLeft;
    widthRef.current = onLeftWidth;
  });

  // open / close the canvas with a short flex-grow transition
  useEffect(() => {
    const p = rightRef.current;
    if (!p) return;
    setAnimating(true);
    const t = setTimeout(() => setAnimating(false), 180);
    if (rightOpen) {
      if (p.isCollapsed()) p.expand();
    } else if (!p.isCollapsed()) {
      p.collapse();
    }
    return () => clearTimeout(t);
  }, [rightOpen, rightRef]);

  const applyLeftPx = useCallback(
    (px: number) => {
      const total = elRef.current?.clientWidth ?? 0;
      if (!total) return;
      const pct = Math.max(0, Math.min(100, (px / total) * 100));
      groupRef.current?.setLayout({ left: pct, right: 100 - pct });
    },
    [groupRef],
  );

  // the requested width applies on mount and whenever it changes, until the
  // user drags the splitter (their choice then wins)
  const userSized = useRef(false);
  useLayoutEffect(() => {
    if (defaultLeftPx == null || !rightOpen || userSized.current) return;
    applyLeftPx(defaultLeftPx);
  }, [defaultLeftPx, rightOpen, applyLeftPx]);

  const onLayoutChanged = useCallback(
    (layout: Layout, meta: { isUserInteraction: boolean }) => {
      const total = elRef.current?.clientWidth ?? 0;
      if (!total || layout.left == null) return;
      const px = (layout.left / 100) * total;
      if (meta.isUserInteraction) userSized.current = true;
      if (meta.isUserInteraction && snapRef.current) {
        const snapped = snapRef.current(px, total);
        if (Math.abs(snapped - px) > 1) {
          const pct = (snapped / total) * 100;
          groupRef.current?.setLayout({ left: pct, right: 100 - pct });
          widthRef.current?.(snapped);
          return;
        }
      }
      widthRef.current?.(px);
    },
    [groupRef],
  );

  return (
    <Group
      orientation="horizontal"
      groupRef={groupRef}
      elementRef={elRef}
      onLayoutChanged={onLayoutChanged}
      className={`h-full w-full ${className}`}
      data-animating={animating || undefined}
    >
      <Panel id="left" minSize={leftMin} className={animating ? "transition-[flex-grow] duration-[140ms] ease-out" : ""}>
        {left}
      </Panel>
      <Separator
        id="split"
        disabled={!rightOpen}
        className={`group/sep relative w-1.5 shrink-0 ${rightOpen ? "cursor-col-resize" : "pointer-events-none w-0"}`}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-edge transition-colors group-hover/sep:bg-accent group-active/sep:bg-accent"
        />
      </Separator>
      <Panel
        id="right"
        panelRef={rightRef}
        minSize={rightMin}
        collapsible
        collapsedSize={0}
        defaultSize={rightOpen ? undefined : 0}
        className={animating ? "transition-[flex-grow] duration-[140ms] ease-out" : ""}
      >
        {right}
      </Panel>
    </Group>
  );
}

// ----------------------------------------------------------------- keyboard

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded-chip border border-edge bg-raised px-1 font-mono text-10 text-muted">
      {children}
    </kbd>
  );
}

/** A full-width indeterminate 2px progress bar (composer working overlay). */
export function ProgressBar({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-0.5 w-full overflow-hidden bg-accent-tint ${className}`} aria-hidden>
      <span className="absolute top-0 h-full rounded-full bg-accent animate-progress motion-reduce:animate-none" />
    </div>
  );
}

/** Empty state: an icon, one bold line and one muted line (§2.7). */
export function EmptyNote({
  icon,
  title,
  hint,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center ${className}`}>
      {icon && <div className="mb-2 text-faint">{icon}</div>}
      <p className="text-13 font-semibold text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-12 leading-relaxed text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Page container for list pages: scrolls inside itself, never sideways. */
export function PageFrame({
  children,
  width = "max-w-6xl",
  className = "",
}: {
  children: ReactNode;
  width?: string;
  className?: string;
}) {
  return (
    <div className={`h-full overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 ${className}`}>
      <div className={`mx-auto w-full min-w-0 ${width}`}>{children}</div>
    </div>
  );
}

/** A style helper for the app-bar style "selected" 8% fill. */
export const FILL_SELECTED = "bg-fill";

