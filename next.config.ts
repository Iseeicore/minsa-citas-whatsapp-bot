import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image (see Dockerfile) builds with NEXT_OUTPUT_STANDALONE=true to
  // get .next/standalone: a minimal server.js plus only the traced node_modules.
  // Unset everywhere else, so Vercel builds exactly as before.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
