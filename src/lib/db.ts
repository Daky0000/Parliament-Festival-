import { PrismaClient } from "@prisma/client";

// One long-lived Prisma client per Node process (Railway server, scripts,
// tests). Kept on globalThis so `next dev` hot reloads do not open new pools.

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = new PrismaClient({ datasourceUrl: databaseUrl() });
  }
  return globalForPrisma.__prisma;
}

// Lazy proxy so `import { prisma } from "@/lib/db"` call sites resolve the
// client at call time, not import time (DATABASE_URL may be unset at build).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
