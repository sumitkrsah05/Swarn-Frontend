"use client";

/**
 * Application chrome: the 44px app bar plus a main region that owns the page
 * height, so screens use `h-full` and scroll inside themselves rather than
 * the window (the page never scrolls horizontally).
 *
 * The chrome waits for lib/auth to know who is signed in: /login renders bare,
 * every other route shows a loader until GET /api/auth/me answers, and a
 * signed-out user is on their way to /login (AuthProvider redirects).
 */

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppBar } from "@/components/app-bar";
import { LOGIN_PATH, useAuth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";
import { Banner, Button, Loading } from "@/components/ui";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();

  if (pathname === LOGIN_PATH) return <>{children}</>;

  if (auth.status === "unreachable") {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <div className="w-full max-w-md space-y-3">
          <Banner tone="err" title="The backend is not reachable">
            {auth.error ?? `Nothing answered at ${API_BASE}.`}
          </Banner>
          <Button variant="primary" onClick={() => void auth.refresh()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (auth.status !== "signed-in") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading label={auth.status === "loading" ? "Checking your session…" : "Redirecting to sign-in…"} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AppBar />
      <main id="main" className="relative min-h-0 flex-1">
        {/* each route rises in; the key restarts the animation on navigation */}
        <div key={pathname} className="h-full animate-page-in motion-reduce:animate-none">
          {children}
        </div>
      </main>
    </div>
  );
}
