import { Banner, PageFrame } from "@/components/ui";

/**
 * Route group for the evaluation screens (/evals…). It shares the app shell
 * with the rest of the app but uses a wider content column because run
 * tables need the room. The page itself never scrolls horizontally; every
 * table scrolls inside its own container.
 *
 * swarn-backend serves `/api/eval/*` in its phase 2; until then these screens
 * show the backend's 404s as errors, so say so up front.
 */
export default function EvalsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame width="max-w-7xl">
      <Banner tone="neutral" className="mb-4" title="Evaluations are not served by this backend yet">
        The hosted backend adds the <code className="font-mono text-12">/api/eval/*</code> endpoints in its next phase. Until then
        these screens cannot load or start evaluation runs.
      </Banner>
      {children}
    </PageFrame>
  );
}
