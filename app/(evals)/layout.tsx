/**
 * Route group for the LLM-evaluation screens (/evals…). It shares the root
 * shell (sidebar, providers) with the rest of the dashboard but uses a wider
 * content column because run tables need the room. The page itself never
 * scrolls horizontally; every table scrolls inside its own container.
 */
export default function EvalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-x-hidden overflow-y-auto px-6 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-7xl min-w-0">{children}</div>
    </div>
  );
}
