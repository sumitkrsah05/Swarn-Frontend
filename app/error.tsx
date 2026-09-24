"use client";

/** Route-level error boundary: a render or data error inside any page. */

import { useEffect } from "react";
import Link from "next/link";
import { AlertIcon, Button } from "@/components/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-xl border border-err/40 bg-panel p-6 shadow-sm">
        <div className="flex items-center gap-2.5 text-err">
          <AlertIcon size={18} />
          <h1 className="text-base font-semibold">Something went wrong on this page</h1>
        </div>
        <p className="mt-3 text-sm text-muted">
          The screen failed to render. The rest of the app is unaffected, so you can retry or move
          on.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-edge bg-raised/60 p-3 font-mono text-xs break-words whitespace-pre-wrap text-fg">
          {error.message || "No error message was provided."}
        </pre>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-faint">digest {error.digest}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md border border-edge px-3.5 text-sm text-fg transition-colors hover:bg-hover"
          >
            Back to chat
          </Link>
        </div>
      </div>
    </div>
  );
}
