import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Liveness + DB check for deploy smoke tests. Returns no secrets and no counts.
export async function GET() {
  const version = process.env.GIT_SHA || "dev";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", version }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Server-side log only; the response stays generic.
    console.error("health: database check failed", err);
    return Response.json(
      { status: "error", version },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
