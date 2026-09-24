"use client";

/** Last-resort boundary: replaces the whole document when the root layout fails. */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f7f8",
          color: "#272727",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.125rem", margin: 0 }}>The application failed to start</h1>
          <p style={{ color: "#6e6e6e", fontSize: "0.875rem" }}>
            {error.message || "An unrecoverable error occurred."}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              background: "#6366f1",
              color: "#fff",
              border: 0,
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
