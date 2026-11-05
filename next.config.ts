import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Let OpenNext resolve Prisma with the "workerd" export condition (the
  // WASM query compiler) instead of bundling the native Node engine.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
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
