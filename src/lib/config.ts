import { z } from "zod";
import { decodeKey } from "./crypto";

export type AppEnv = "local" | "ci" | "staging" | "production";

export class ConfigError extends Error {}

export function appEnv(): AppEnv {
  const v = process.env.APP_ENV;
  return v === "ci" || v === "staging" || v === "production" ? v : "local";
}

export const isDeployed = () => appEnv() === "staging" || appEnv() === "production";

/**
 * The public origin used for CSRF checks and absolute links. APP_URL is a
 * runtime var (wrangler vars); NEXT_PUBLIC_APP_URL is the build-time fallback.
 */
export function appOrigin(): string {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return new URL(raw).origin;
}

const deployedSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENCRYPTION_KEY: z.string().refine((v) => {
    try {
      decodeKey(v);
      return true;
    } catch {
      return false;
    }
  }, "must be 32 bytes, base64"),
  APP_URL: z.string().url().startsWith("https://"),
});

let validated = false;

/** Throws ConfigError naming missing/invalid variables (never their values). */
export function assertConfig(): void {
  if (validated || !isDeployed()) return;
  const result = deployedSchema.safeParse(process.env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new ConfigError(`Invalid configuration: ${names.join(", ")}`);
  }
  validated = true;
}
