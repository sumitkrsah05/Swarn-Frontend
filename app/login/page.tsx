"use client";

/**
 * Sign-in. The backend owns the whole OAuth dance: the button sends the browser
 * to GET /api/auth/google/login, Google comes back to the backend's callback,
 * which sets the `swarn_session` cookie and redirects here to `next`.
 * A failed callback lands on `/login?error=<code>`.
 *
 * In development (BACKEND_DEV_LOGIN=1 on a backend without a Google client id)
 * an email can be signed in directly.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE, devLoginUrl, googleLoginUrl, safeNext } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Banner, Button, Field, Input, Loading, SwarnMark } from "@/components/ui";

const ERRORS: Record<string, string> = {
  not_allowed: "That Google account is not on this deployment's allow list. Ask an administrator to add your email or domain.",
  unverified_email: "Google reports that email address as unverified, so it cannot be used to sign in.",
  bad_state: "The sign-in attempt expired or was started in another tab. Try again.",
  oidc: "Google did not complete the sign-in. Try again; if it keeps failing, the backend's Google client settings may be wrong.",
  missing_code: "Google returned without an authorisation code. Try again.",
  access_denied: "You cancelled the Google sign-in.",
};

function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.4-5.6l-7.5-5.8c-2 1.4-4.7 2.3-7.9 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const next = safeNext(params.get("next"));
  const errorCode = params.get("error");
  const [email, setEmail] = useState("");
  const dev = process.env.NODE_ENV !== "production";

  // already signed in (cookie still valid): straight back to the app
  useEffect(() => {
    if (auth.status === "signed-in") router.replace(next);
  }, [auth.status, next, router]);

  if (auth.status === "loading") return <Loading label="Checking your session…" />;

  return (
    <div className="w-full max-w-sm space-y-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-accent">
          <SwarnMark size={40} />
        </span>
        <h1 className="wordmark text-[32px] leading-none text-fg">swarn</h1>
        <p className="text-13 text-muted">Sign in to open your workspaces, data and runs.</p>
      </div>

      {errorCode && (
        <Banner tone="err" title="Sign-in failed">
          {ERRORS[errorCode] ?? `The backend reported "${errorCode}".`}
        </Banner>
      )}
      {auth.status === "unreachable" && (
        <Banner tone="warn" title="The backend is not reachable">
          {auth.error ?? `Nothing answered at ${API_BASE}.`}{" "}
          <button type="button" className="underline" onClick={() => void auth.refresh()}>
            Retry
          </button>
        </Banner>
      )}

      <a
        href={googleLoginUrl(next)}
        className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-edge bg-panel text-13 font-medium text-fg shadow-hair transition-colors hover:bg-hover"
      >
        <GoogleMark />
        Continue with Google
      </a>

      {dev && (
        <details className="rounded-panel border border-edge bg-raised/60 p-3 text-12 text-muted">
          <summary className="cursor-pointer select-none text-fg">Developer sign-in (no Google)</summary>
          <p className="mt-2">
            Works only when the backend runs with <code className="font-mono">BACKEND_DEV_LOGIN=1</code>, no Google client id, and a
            localhost public URL. Any address signs in as that user.
          </p>
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) window.location.assign(devLoginUrl(email.trim(), next));
            }}
          >
            <Field label="Email" htmlFor="dev-email" className="flex-1">
              <Input id="dev-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Button type="submit" size="sm" disabled={!email.trim()}>
              Sign in
            </Button>
          </form>
        </details>
      )}

      <p className="text-center font-mono text-10 text-faint">API {API_BASE}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="graph-paper flex h-full min-h-screen items-center justify-center px-4 py-12">
      <Suspense fallback={<Loading label="Loading…" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
