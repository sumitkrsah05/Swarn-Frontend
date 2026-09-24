import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* self-contained server for the Dockerfile (node .next/standalone/server.js) */
  output: "standalone",
  /* the dev server only serves its chunks to the host it was started with
     (localhost); allow the loopback address too so http://127.0.0.1:3000 works */
  allowedDevOrigins: ["127.0.0.1"],
  /* legacy URLs from the chat-era layout keep resolving (docs/guide.md §6.2);
     query strings pass through, so /workspace?path=plots lands on /files?path=plots */
  async redirects() {
    return [
      { source: "/run", destination: "/jobs?new=1", permanent: false },
      { source: "/sessions", destination: "/history?tab=sessions", permanent: false },
      { source: "/runs", destination: "/history?tab=runs", permanent: false },
      { source: "/workspace", destination: "/files", permanent: false },
      { source: "/playbook", destination: "/knowledge", permanent: false },
    ];
  },
};

export default nextConfig;
