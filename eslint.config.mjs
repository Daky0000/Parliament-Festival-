import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Baseline (Phase 0): legacy code uses `any` widely and is rewritten in
    // Phases 1-4. Restored to "error" in Phase 8.
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".open-next/**",
    ".wrangler/**",
    "docs/email/previews/**",
  ]),
]);
