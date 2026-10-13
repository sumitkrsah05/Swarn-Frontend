"use client";

/**
 * Who is signed in. `AuthProvider` asks GET /api/auth/me once on mount and
 * again whenever the route changes away from /login; a 401 anywhere in the app
 * (lib/api.ts calls the handler registered here) sends the browser to
 * `/login?next=<path>`. Pages render only once the user is known, so no screen
 * ever flashes with unauthenticated data.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, setUnauthorizedHandler, type AuthUser } from "./api";

export type AuthStatus = "loading" | "signed-in" | "signed-out" | "unreachable";

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** the message of the error that left us "unreachable" */
  error: string | null;
  /** re-ask the backend who we are */
  refresh: () => Promise<void>;
  /** POST /api/auth/logout, then /login */
  signOut: (everywhere?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  status: "loading",
  user: null,
  error: null,
  refresh: async () => {},
  signOut: async () => {},
});

export const LOGIN_PATH = "/login";

/** `/login?next=<where we were>` — the login page sends the user back there. */
export function loginHref(from?: string | null): string {
  const next = from && from.startsWith("/") && !from.startsWith(LOGIN_PATH) ? from : "/";
  return next === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onLogin = pathname === LOGIN_PATH;
  const redirecting = useRef(false);

  const toLogin = useCallback(() => {
    if (redirecting.current) return;
    redirecting.current = true;
    const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
    router.replace(loginHref(here));
  }, [router]);

  const applyUser = useCallback((me: AuthUser) => {
    setUser(me);
    setError(null);
    setStatus("signed-in");
    redirecting.current = false;
  }, []);
  const applyFailure = useCallback((e: unknown) => {
    setUser(null);
    if (e instanceof ApiError && e.status === 401) {
      setStatus("signed-out");
    } else {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("unreachable");
    }
  }, []);

  const refresh = useCallback(() => api.me().then(applyUser, applyFailure), [applyUser, applyFailure]);

  // one global reaction to any 401: go to the login page (the login page itself never redirects)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("signed-out");
      if (window.location.pathname !== LOGIN_PATH) toLogin();
    });
    return () => setUnauthorizedHandler(null);
  }, [toLogin]);

  // who owns the cookie — once on mount, and again after leaving /login (the backend's redirect)
  const wasOnLogin = useRef(onLogin);
  useEffect(() => {
    const leftLogin = wasOnLogin.current && !onLogin;
    wasOnLogin.current = onLogin;
    if (!leftLogin && status !== "loading") return;
    let cancelled = false;
    api.me().then(
      (me) => {
        if (!cancelled) applyUser(me);
      },
      (e: unknown) => {
        if (!cancelled) applyFailure(e);
      },
    );
    return () => {
      cancelled = true;
    };
    // `status` is read only to run the initial load once; later loads are route-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLogin, applyUser, applyFailure]);

  useEffect(() => {
    if (status === "signed-out" && !onLogin) toLogin();
  }, [status, onLogin, toLogin]);

  const signOut = useCallback(
    async (everywhere = false) => {
      try {
        if (everywhere) await api.logoutAll();
        else await api.logout();
      } catch {
        /* the cookie may already be gone; the login page is right either way */
      }
      setUser(null);
      setStatus("signed-out");
      redirecting.current = true;
      router.replace(LOGIN_PATH);
    },
    [router],
  );

  const value = useMemo<AuthState>(() => ({ status, user, error, refresh, signOut }), [status, user, error, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** The signed-in user, or null while loading / signed out. */
export function useUser(): AuthUser | null {
  return useContext(AuthContext).user;
}

export function useIsAdmin(): boolean {
  return useContext(AuthContext).user?.role === "admin";
}
