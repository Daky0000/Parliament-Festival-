import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

// Two runtimes, one `prisma` export:
// - Node (next dev, tests, seed scripts): one long-lived client over TCP.
// - Cloudflare Workers: a Neon serverless client per request. Workers forbid
//   reusing a socket opened by another request, so the client is keyed on
//   the per-request Cloudflare context object. Background tasks (cron) set
//   their own client with runWithTaskClient().

// WebSocketPair exists only in the Workers runtime.
const isWorkers =
  typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair === "function" ||
  (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function createWorkerClient(): PrismaClient {
  // Workers cannot load Prisma's native engine; use the WASM build explicitly.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: WasmPrismaClient } = require("@prisma/client/wasm") as typeof import("@prisma/client");
  return new WasmPrismaClient({ adapter: new PrismaNeon({ connectionString: databaseUrl() }) });
}

const perRequest = new WeakMap<object, PrismaClient>();
// AsyncLocalStorage is only needed on Workers (nodejs_compat); loaded lazily
// so this module never pulls node:async_hooks into other bundles.
type Als<T> = { getStore(): T | undefined; run<R>(store: T, fn: () => R): R };
let taskScopeInstance: Als<PrismaClient> | null = null;
function taskScope(): Als<PrismaClient> {
  if (!taskScopeInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
    taskScopeInstance = new AsyncLocalStorage<PrismaClient>();
  }
  return taskScopeInstance;
}

function getWorkerClient(): PrismaClient {
  const task = taskScope().getStore();
  if (task) return task;
  // Resolved lazily so Node never loads the Workers adapter package.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getCloudflareContext } = require("@opennextjs/cloudflare") as typeof import("@opennextjs/cloudflare");
  const { ctx } = getCloudflareContext();
  let client = perRequest.get(ctx);
  if (!client) {
    client = createWorkerClient();
    perRequest.set(ctx, client);
  }
  return client;
}

/** For cron/queue handlers on Workers: run `fn` with a dedicated client. */
export async function runWithTaskClient<T>(fn: () => Promise<T>): Promise<T> {
  const client = createWorkerClient();
  try {
    return await taskScope().run(client, fn);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

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
