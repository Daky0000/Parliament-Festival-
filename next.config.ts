import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Build-time constants. GIT_SHA (CI) or RAILWAY_GIT_COMMIT_SHA (Railway build) lets /api/health report the
  // deployed commit.
  env: {
    GIT_SHA: process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "dev",
  },
};

export default nextConfig;

