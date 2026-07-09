import type { NextConfig } from "next";

// AD-15: one artifact, two run modes. Build with `output: 'standalone'` so the
// identical artifact runs on localhost (local-first) and on a hosted EU instance.
// Launch the build via `.next/standalone/server.js`, NOT `next start`.
// Do NOT add environment-forked code paths that only exist in one run mode.
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
