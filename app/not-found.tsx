import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-faint">404</p>
        <h1 className="mt-1 text-xl font-semibold text-fg">This page does not exist</h1>
        <p className="mt-2 text-sm text-muted">
          The link may be out of date, or the run or session it pointed at has been deleted.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}
