"use client";

/**
 * Application chrome: the 44px app bar plus a main region that owns the page
 * height, so screens use `h-full` and scroll inside themselves rather than
 * the window (the page never scrolls horizontally).
 */

import type { ReactNode } from "react";
import { AppBar } from "@/components/app-bar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AppBar />
      <main id="main" className="relative min-h-0 flex-1">
        {children}
      </main>
    </div>
  );
}
