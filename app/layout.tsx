import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LiveProvider } from "@/lib/live";
import { ToastProvider } from "@/components/toast";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";
import { WorkspaceProvider } from "@/lib/workspace-store";
import { RunnerProvider } from "@/hooks/useWorkspaceRunner";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const overusedGrotesk = localFont({
  src: [
    { path: "./fonts/OverusedGrotesk-Roman.otf", weight: "400" },
    { path: "./fonts/OverusedGrotesk-Medium.otf", weight: "500" },
    { path: "./fonts/OverusedGrotesk-SemiBold.otf", weight: "600" },
    { path: "./fonts/OverusedGrotesk-Bold.otf", weight: "700" },
  ],
  variable: "--font-overused-grotesk",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "swarn", template: "%s · swarn" },
  description:
    "Analyse data with an agent that shows its work: a data-thread workspace, live jobs, session traces, and LLM evaluations.",
  applicationName: "swarn",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1012" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${overusedGrotesk.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* applies the stored / OS theme before first paint (no flash) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg text-fg">
        <QueryProvider>
          <LiveProvider>
            <ToastProvider>
              <WorkspaceProvider>
                {/* one runner for every workspace: jobs keep streaming on any page */}
                <RunnerProvider>
                  <AppShell>{children}</AppShell>
                </RunnerProvider>
              </WorkspaceProvider>
            </ToastProvider>
          </LiveProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
