"use client";

/**
 * The 816px document column (docs/guide.md §2.6): report typography with no
 * chrome, plus an optional floating vertical pill stack at the top-left
 * (open · download · copy · delete). HTML reports render in a sandboxed
 * iframe sized to their content; markdown goes through the Markdown component.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Markdown } from "@/components/markdown";
import { CheckIcon, CopyIcon, DownloadIcon, ExternalIcon, IconButton, TrashIcon } from "@/components/ui";

export interface DocumentAction {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  download?: string;
  danger?: boolean;
}

export function DocumentActions({ actions }: { actions: DocumentAction[] }) {
  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-canvas border border-edge bg-panel p-1 shadow-hair">
      {actions.map((a) =>
        a.href ? (
          <a
            key={a.label}
            href={a.href}
            download={a.download}
            target={a.download ? undefined : "_blank"}
            rel="noreferrer"
            title={a.label}
            aria-label={a.label}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg"
          >
            {a.icon}
          </a>
        ) : (
          <IconButton key={a.label} label={a.label} onClick={a.onClick} tone={a.danger ? "danger" : "default"}>
            {a.icon}
          </IconButton>
        ),
      )}
    </div>
  );
}

export function CopyAction({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? "Copied" : "Copy content"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </IconButton>
  );
}

/** A sandboxed iframe that grows to fit agent-produced HTML. */
export function SandboxedHtml({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      try {
        // same-origin (the API base) is allowed by the sandbox so we can measure
        const h = el.contentDocument?.documentElement?.scrollHeight;
        if (h && h > 100) setHeight(h + 24);
      } catch {
        /* cross-origin: keep the default height */
      }
    };
    el.addEventListener("load", fit);
    const t = setInterval(fit, 1500);
    return () => {
      el.removeEventListener("load", fit);
      clearInterval(t);
    };
  }, [src]);
  return (
    <iframe
      ref={ref}
      title={title}
      src={src}
      sandbox="allow-same-origin"
      className="w-full rounded-panel border border-edge bg-white"
      style={{ height }}
    />
  );
}

export function DocumentColumn({
  markdown,
  htmlSrc,
  title,
  actions,
  className = "",
}: {
  markdown?: string | null;
  htmlSrc?: string | null;
  title: string;
  actions?: DocumentAction[] | ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative mx-auto w-full max-w-[calc(816px+5rem)] px-4 py-6 sm:px-10 ${className}`}>
      {actions && (
        <div className="pointer-events-none sticky top-2 z-[3] float-left -ml-1 mr-2 hidden sm:block">
          {Array.isArray(actions) ? <DocumentActions actions={actions} /> : actions}
        </div>
      )}
      <article className="mx-auto w-full max-w-[816px] animate-fade-in">
        {htmlSrc ? (
          <SandboxedHtml src={htmlSrc} title={title} />
        ) : markdown != null ? (
          <div className="document">
            <Markdown>{markdown}</Markdown>
          </div>
        ) : null}
      </article>
    </div>
  );
}

export { DownloadIcon, ExternalIcon, TrashIcon };
