import { PageFrame } from "@/components/ui";

/**
 * Route group for the evaluation screens (/evals…). It shares the app shell
 * with the rest of the app but uses a wider content column because run
 * tables need the room. The page itself never scrolls horizontally; every
 * table scrolls inside its own container.
 */
export default function EvalsLayout({ children }: { children: React.ReactNode }) {
  return <PageFrame width="max-w-7xl">{children}</PageFrame>;
}
