"use client";

/**
 * The 44px app bar on every page (docs/guide.md §6.1).
 *
 *   left    logo box · "swarn" wordmark · Workspace · Jobs · History · Evals · Files
 *   centre  the workspace name ▾ (Workspace) or the page title as a label
 *   right   model name · live dot · theme toggle · ⋮ (Playbook, API docs)
 *
 * Below 900px the nav collapses into a dropdown and the right cluster into ⋮.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { API_BASE } from "@/lib/api";
import { useLiveStatus, type WsStatus } from "@/lib/live";
import { useEndpoints } from "@/hooks/useEvalData";
import { useActiveWorkspace, useWorkspaceActions } from "@/lib/workspace-store";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspacesDialog } from "@/components/workspace/workspaces-dialog";
import {
  BookIcon,
  ChevronDownIcon,
  ExternalIcon,
  IconButton,
  Menu,
  MoreIcon,
  SectionLabel,
  SwarnMark,
  type MenuItem,
} from "@/components/ui";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Workspace" },
  { href: "/jobs", label: "Jobs" },
  { href: "/history", label: "History" },
  { href: "/evals", label: "Evals" },
  { href: "/files", label: "Files" },
];

/** Deep links that belong to a nav section without sharing its prefix. */
const SECTION_OF: [RegExp, string][] = [
  [/^\/sessions(\/|$)/, "/history"],
  [/^\/runs(\/|$)/, "/history"],
  [/^\/knowledge(\/|$)/, "/"],
];

export function activeNav(pathname: string): string {
  for (const [re, href] of SECTION_OF) if (re.test(pathname)) return href;
  for (const n of NAV) {
    if (n.href === "/") continue;
    if (pathname === n.href || pathname.startsWith(n.href + "/")) return n.href;
  }
  return pathname === "/" ? "/" : "";
}

const PAGE_TITLE: [RegExp, string][] = [
  [/^\/jobs\/[^/]+/, "Job"],
  [/^\/jobs/, "Jobs"],
  [/^\/history/, "History"],
  [/^\/sessions\/[^/]+/, "Session"],
  [/^\/runs\/[^/]+/, "AIDE run"],
  [/^\/evals\/new/, "New evaluation"],
  [/^\/evals\/compare/, "Compare runs"],
  [/^\/evals\/[^/]+/, "Evaluation run"],
  [/^\/evals/, "Evaluations"],
  [/^\/files/, "Files"],
  [/^\/knowledge/, "Knowledge"],
];

function pageTitle(pathname: string): string {
  for (const [re, t] of PAGE_TITLE) if (re.test(pathname)) return t;
  return "";
}

const WS_LABEL: Record<WsStatus, { text: string; dot: string }> = {
  connecting: { text: "connecting to the live feed", dot: "bg-warn" },
  live: { text: "live feed connected", dot: "bg-ok" },
  reconnecting: { text: "live feed reconnecting — polling instead", dot: "bg-warn animate-pulse motion-reduce:animate-none" },
};

function LiveDot({ compact }: { compact?: boolean }) {
  const status = useLiveStatus();
  const ws = WS_LABEL[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-11 text-muted"
      title={ws.text}
      role="status"
      aria-label={ws.text}
    >
      <span className={`h-2 w-2 rounded-full ${ws.dot}`} aria-hidden />
      {!compact && <span className="hidden xl:inline">{status === "live" ? "live" : status}</span>}
    </span>
  );
}

function ModelName({ className = "" }: { className?: string }) {
  const endpoints = useEndpoints();
  const model = endpoints.data?.deployed.model;
  if (!model) return null;
  return (
    <span className={`truncate font-mono text-11 text-muted ${className}`} title={`model: ${model}`}>
      {model}
    </span>
  );
}

function WorkspaceSwitcher() {
  const active = useActiveWorkspace();
  const actions = useWorkspaceActions();
  const [open, setOpen] = useState(false);
  const name = active?.name ?? "Workspaces";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex max-w-[40vw] items-center gap-1 rounded-md px-2 py-1 text-13 text-fg transition-colors hover:bg-hover"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Switch workspace"
      >
        <span className="truncate">{name}</span>
        <ChevronDownIcon size={13} className="shrink-0 text-muted" />
      </button>
      {active && (
        <button
          type="button"
          onClick={() => actions.setActive(null)}
          className="hidden rounded-md px-1.5 py-1 text-11 text-muted transition-colors hover:bg-hover hover:text-fg sm:inline"
          title="Back to the landing page"
        >
          home
        </button>
      )}
      <WorkspacesDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function AppBar() {
  const pathname = usePathname();
  const router = useRouter();
  const current = activeNav(pathname);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [navAnchor, setNavAnchor] = useState<HTMLElement | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const endpoints = useEndpoints();
  const live = useLiveStatus();
  const wsActions = useWorkspaceActions();
  // the logo always lands on the landing page: leave the open workspace first
  const goHome = () => wsActions.setActive(null);

  const overflow: MenuItem[] = [
    { label: "Playbook", icon: <BookIcon size={14} />, href: "/knowledge" },
    { label: "API docs", icon: <ExternalIcon size={14} />, href: `${API_BASE}/docs`, external: true },
    {
      label: endpoints.data?.deployed.model ? `model · ${endpoints.data.deployed.model}` : "model · unknown",
      disabled: true,
      separator: true,
    },
    { label: `live feed · ${live}`, disabled: true },
  ];

  const navItems: MenuItem[] = NAV.map((n) => ({
    label: n.label,
    onSelect: () => router.push(n.href),
  }));

  const currentLabel = NAV.find((n) => n.href === current)?.label ?? pageTitle(pathname) ?? "Menu";

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-edge bg-panel pr-2" role="banner">
      {/* left: logo box aligned with the 40px rail + wordmark + nav */}
      <Link
        href="/"
        onClick={goHome}
        className="flex h-10 w-10 shrink-0 items-center justify-center text-accent"
        aria-label="swarn home"
        title="swarn — landing page"
      >
        <SwarnMark size={22} />
      </Link>
      <Link href="/" onClick={goHome} className="wordmark mr-2 hidden text-16 text-fg sm:inline">
        swarn
      </Link>

      <nav aria-label="Main navigation" className="hidden items-center nav:flex">
        {NAV.map((n) => {
          const selected = current === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={selected ? "page" : undefined}
              className={`flex h-8 items-center px-2.5 text-13 transition-colors ${
                selected ? "bg-fill text-fg" : "text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        ref={setNavAnchor}
        onClick={() => setNavOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={navOpen}
        className="flex h-8 items-center gap-1 rounded-md px-2 text-13 text-fg hover:bg-hover nav:hidden"
      >
        {currentLabel}
        <ChevronDownIcon size={13} className="text-muted" />
      </button>
      <Menu anchor={navAnchor} open={navOpen} onClose={() => setNavOpen(false)} items={navItems} placement="bottom-start" label="Pages" width={180} />

      {/* centre */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2">
        {current === "/" && pathname === "/" ? (
          <WorkspaceSwitcher />
        ) : (
          <SectionLabel as="h1" className="truncate">
            {pageTitle(pathname)}
          </SectionLabel>
        )}
      </div>

      {/* right */}
      <div className="hidden items-center gap-3 nav:flex">
        <ModelName className="max-w-[16rem]" />
        <LiveDot />
      </div>
      <div className="flex items-center gap-1 nav:hidden">
        <LiveDot compact />
      </div>
      <ThemeToggle />
      <IconButton label="More" ref={setMoreAnchor} onClick={() => setMoreOpen((o) => !o)} aria-haspopup="menu" aria-expanded={moreOpen}>
        <MoreIcon size={16} />
      </IconButton>
      <Menu anchor={moreAnchor} open={moreOpen} onClose={() => setMoreOpen(false)} items={overflow} label="More" width={260} />
    </header>
  );
}
