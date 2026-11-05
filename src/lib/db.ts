import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { cache } from "react";

// Two runtimes, one `prisma` export:
// - Node (next dev, tests, seed scripts): one long-lived client over TCP.
// - Cloudflare Workers: a Neon serverless client per request. Workers forbid
//   reusing a socket opened by another request, so the client is scoped with
//   React `cache()`, which memoizes for the lifetime of one server request.

const isWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const getWorkerClient = cache(
  () => new PrismaClient({ adapter: new PrismaNeon({ connectionString: databaseUrl() }) })
);

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function getNodeClient(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = new PrismaClient({ datasourceUrl: databaseUrl() });
  }
  return globalForPrisma.__prisma;
}

export function getPrisma(): PrismaClient {
  return isWorkers ? getWorkerClient() : getNodeClient();
}

// Lazy proxy so existing `import { prisma } from "@/lib/db"` call sites keep
// working and resolve the right client at call time, not at import time.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
