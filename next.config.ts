import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Build-time constants. GIT_SHA is set by CI so /api/health reports the
  // deployed commit.
  env: {
    GIT_SHA: process.env.GIT_SHA || "dev",
  },
};

export default nextConfig;

// Makes Cloudflare bindings available to `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
