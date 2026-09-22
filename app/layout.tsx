import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LiveProvider } from "@/lib/live";
import { ToastProvider } from "@/components/toast";
import { Sidebar } from "@/components/sidebar";
import { QueryProvider } from "@/components/query-provider";
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
  title: "swarn",
  description: "Chat and dashboard for the swarn agent platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
              <Sidebar />
              <main className="ml-52 h-screen">{children}</main>
            </ToastProvider>
          </LiveProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
