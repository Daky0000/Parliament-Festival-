import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { executeAiTool, AI_TOOL_REGISTRY } from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    data: {
      tools: Object.values(AI_TOOL_REGISTRY),
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { toolName, args, message, eventId } = body;

  // 1. Direct Tool Invocation
  if (toolName) {
    try {
      const result = await executeAiTool(toolName, args || {}, user.userId, user.permissions);
      return NextResponse.json({ data: result });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // 2. Natural Language Prompt Interpretation (Intelligent Tool Router)
  if (message && eventId) {
    const text = message.toLowerCase();
    let proposedTool: string | null = null;
    let toolArgs: Record<string, any> = { eventId };

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

    const toolExecution = await executeAiTool(proposedTool, toolArgs, user.userId, user.permissions);

    return NextResponse.json({
      data: {
        reply: `I analyzed your request using parliamentary protocol guidelines and executed tool '${proposedTool}'.`,
        toolExecution,
      },
    });
  }

  return NextResponse.json({ error: "toolName or message is required" }, { status: 400 });
}

