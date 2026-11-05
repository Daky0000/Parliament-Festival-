import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { HttpError, notFound, readJson } from "@/lib/http";
import { AI_TOOL_REGISTRY, executeAiTool } from "@/lib/ai/orchestrator";
import type { Permission } from "@/lib/roles";
import { logAuditEvent } from "@/lib/audit";

// Human approval for AI-proposed changes. The stored request (not anything
// the browser sends) is what runs, and only for someone who holds the tool's
// permission on that event. Each request can be decided once.

const Body = z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional() });

export const POST = withActor<{ executionId: string }>(async (request, { actor, params }) => {
  const body = Body.parse(await readJson(request));
  const exec = await prisma.aiToolExecution.findUnique({
    where: { id: params.executionId },
    include: { interaction: { include: { session: true } } },
  });
  if (!exec || !exec.interaction.session.eventId) throw notFound();
  const tool = AI_TOOL_REGISTRY[exec.toolName];
  if (!tool) throw notFound();
  const event = await authorizeEvent(actor, tool.permissionKey as Permission, exec.interaction.session.eventId);

  // Claim atomically so two approvers cannot both run it.
  const claimed = await prisma.aiToolExecution.updateMany({
    where: { id: exec.id, status: "awaiting_approval" },
    data: body.decision === "approve"
      ? { status: "executing", approvedBy: actor.userId, approvedAt: new Date() }
      : { status: "denied", approvedBy: actor.userId, approvedAt: new Date(), errorSummary: body.note ?? "Rejected" },
  });
  if (claimed.count !== 1) throw new HttpError(409, "This request has already been decided.");

  await logAuditEvent({
    organizationId: event.organizationId,
    eventId: event.id,
    actorUserId: actor.userId,
    action: body.decision === "approve" ? "ai.tool_approved" : "ai.tool_rejected",
    entityType: "ai_tool_execution",
    entityId: exec.id,
    reason: body.note,
    afterData: { toolName: exec.toolName },
  });
  if (body.decision === "reject") return NextResponse.json({ data: { status: "denied" } });

  const args = JSON.parse(exec.inputSummary || "{}");
  try {
    const result = await executeAiTool(exec.toolName, { ...args, eventId: event.id }, actor, { approved: true });
    const status = (result as { status?: string }).status === "denied" ? "denied" : "completed";
    await prisma.aiToolExecution.update({
      where: { id: exec.id },
      data: { status, executedAt: new Date(), outputSummary: JSON.stringify(result).slice(0, 8000) },
    });
    return NextResponse.json({ data: { status, result } });
  } catch (err) {
    await prisma.aiToolExecution.update({ where: { id: exec.id }, data: { status: "failed", errorSummary: String((err as Error).message).slice(0, 500) } });
    throw err;
  }
});
