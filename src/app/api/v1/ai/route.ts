import { NextResponse } from "next/server";
import { withActor, canAny } from "@/lib/authz";
import { forbidden } from "@/lib/http";
import { executeAiTool, AI_TOOL_REGISTRY } from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";

// Interim AI endpoint (Phase 1: authorization only). Phase 6 replaces the
// keyword router with real provider calls and server-side approvals.

export const GET = withActor(async (_req, { actor }) => {
  if (!canAny(actor, "ai.use")) throw forbidden();
  return NextResponse.json({ data: { tools: Object.values(AI_TOOL_REGISTRY) } });
});

export const POST = withActor(async (request, { actor }) => {
  if (!canAny(actor, "ai.use")) throw forbidden();
  const body = await request.json();
  const { toolName, args, message, eventId } = body;

  // 1. Direct tool invocation. Every tool needs an eventId it authorizes.
  if (toolName) {
    const result = await executeAiTool(toolName, { ...(args || {}), eventId: args?.eventId ?? eventId }, actor);
    return NextResponse.json({ data: result });
  }

  // 2. Keyword router
  if (message && eventId) {
    const text = String(message).toLowerCase();
    let proposedTool: string;
    const toolArgs: Record<string, unknown> = { eventId };

    if (text.includes("pending") || text.includes("unanswered") || text.includes("rsvp")) {
      proposedTool = "list_pending_rsvps";
    } else if (text.includes("report") || text.includes("summary") || text.includes("executive")) {
      proposedTool = "draft_event_report";
    } else if (text.includes("seat") || text.includes("allocate") || text.includes("forecourt")) {
      const plan = await prisma.seatingPlan.findFirst({ where: { eventId } });
      proposedTool = "propose_seating_allocation";
      toolArgs.seatingPlanId = plan?.id;
    } else if (text.includes("draft") || text.includes("invitation copy") || text.includes("word")) {
      proposedTool = "draft_invitation_copy";
      toolArgs.recipientTitle = "Hon.";
      toolArgs.recipientName = "Member of Parliament";
      toolArgs.eventTitle = "2026 Festival of Nine Lessons and Carols";
    } else {
      proposedTool = "search_guests";
      toolArgs.query = message;
    }

    const toolExecution = await executeAiTool(proposedTool, toolArgs, actor);
    return NextResponse.json({
      data: { reply: `Executed tool '${proposedTool}'.`, toolExecution },
    });
  }

  return NextResponse.json({ error: "toolName or message is required" }, { status: 400 });
});
