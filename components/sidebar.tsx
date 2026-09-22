"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveStatus, type WsStatus } from "@/lib/live";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Chat", icon: "❯" },
  { href: "/run", label: "New Run", icon: "▶" },
  { href: "/jobs", label: "Jobs", icon: "☰" },
  { href: "/sessions", label: "Sessions", icon: "⟲" },
  { href: "/runs", label: "Runs", icon: "⌥" },
  { href: "/evals", label: "Evals", icon: "≡" },
  { href: "/workspace", label: "Workspace", icon: "▤" },
  { href: "/playbook", label: "Playbook", icon: "✎" },
];

const WS_LABEL: Record<WsStatus, { text: string; dot: string }> = {
  connecting: { text: "connecting", dot: "bg-warn" },
  live: { text: "live", dot: "bg-ok" },
  reconnecting: { text: "reconnecting", dot: "bg-warn animate-pulse" },
};

export function Sidebar() {
  const pathname = usePathname();
  const status = useLiveStatus();
  const ws = WS_LABEL[status];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-52 flex-col border-r border-edge bg-panel">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-accent/15 font-mono text-sm font-bold text-accent">
          s
        </span>
        <div>
          <div className="text-sm font-semibold leading-none text-fg">swarn</div>
          <div className="mt-0.5 font-mono text-[10px] text-faint">
            agent platform
          </div>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-0.5 px-2">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-raised font-medium text-fg"
                  : "text-muted hover:bg-raised/60 hover:text-fg"
              }`}
            >
              <span className="w-4 text-center font-mono text-xs text-faint">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1.5 border-t border-edge px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
          <span className={`h-2 w-2 rounded-full ${ws.dot}`} />
          ws {ws.text}
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
