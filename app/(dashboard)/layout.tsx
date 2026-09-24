/**
 * Route group for the non-workspace screens (Jobs, History, Files, Knowledge
 * and the session / run detail pages). The shell owns the height; each page
 * decides whether it scrolls as a document (PageFrame) or fills the surface.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-full min-h-0">{children}</div>;
}
