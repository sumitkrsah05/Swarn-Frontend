import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* self-contained server for the Dockerfile (node .next/standalone/server.js) */
  output: "standalone",
};

export default nextConfig;
