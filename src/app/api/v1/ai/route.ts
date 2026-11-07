import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, canAny, authorizeEvent } from "@/lib/authz";
import { HttpError, forbidden, readJson } from "@/lib/http";
import { AI_TOOL_REGISTRY, executeAiTool, redactForModel, toolSpecsForModel } from "@/lib/ai/orchestrator";
import { AiUnavailableError, runAgent } from "@/lib/ai/providers";
import { logAuditEvent } from "@/lib/audit";
import { ASSISTANT_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

// AI assistant: a real model (OpenAI primary, Claude secondary) with the
// registry tools. The event is fixed by the server; tools run under the
// signed-in user's permissions; anything that changes data is stored as a
// pending request and runs only after a person approves it
// (POST /api/v1/ai/approvals/[executionId]).

export const GET = withActor(async (_req, { actor }) => {
  if (!canAny(actor, "ai.use")) throw forbidden();
  return NextResponse.json({ data: { tools: Object.values(AI_TOOL_REGISTRY) } });
});

const Body = z.object({
  eventId: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
});

const SYSTEM = ASSISTANT_SYSTEM_PROMPT;

export const POST = withActor(async (request, { actor }) => {
  if (!canAny(actor, "ai.use")) throw forbidden();
  const body = Body.parse(await readJson(request));
  const event = await authorizeEvent(actor, "ai.use", body.eventId);

  const session = await prisma.aiSession.create({
    data: { organizationId: event.organizationId, eventId: event.id, userId: actor.userId, title: body.message.slice(0, 80) },
  });
  const interaction = await prisma.aiInteraction.create({
    data: {
      sessionId: session.id,
      userId: actor.userId,
      provider: "pending",
      model: "pending",
      interactionType: "question",
      promptRedacted: String(redactForModel(body.message)),
      status: "running",
    },
  });

  const executions: { executionId: string; status: string; toolName: string; inputSummary: unknown; message?: string; result?: unknown }[] = [];
  try {
    const result = await runAgent({
      taskKey: "general_summary",
      eventId: event.id,
      system: SYSTEM,
      userText: String(redactForModel(body.message)),
      tools: toolSpecsForModel(),
      runTool: async (call) => {
        const args = { ...call.input, eventId: event.id };
        const tool = AI_TOOL_REGISTRY[call.name];
        const out = await executeAiTool(call.name, args, actor);
        const status = (out as { status?: string }).status ?? "completed";
        const row = await prisma.aiToolExecution.create({
          data: {
            interactionId: interaction.id,
            toolName: call.name,
            permissionKey: tool?.permissionKey ?? "unknown",
            inputSummary: JSON.stringify(args),
            outputSummary: status === "awaiting_approval" ? null : JSON.stringify(redactForModel(out)).slice(0, 8000),
            status,
          },
        });
        executions.push({ executionId: row.id, status, toolName: call.name, inputSummary: args, message: (out as { message?: string }).message, result: out });
        return redactForModel(status === "awaiting_approval" ? { status, approvalId: row.id, message: "Queued for human approval." } : out);
      },
    });

    await prisma.aiInteraction.update({
      where: { id: interaction.id },
      data: {
        provider: result.provider,
        model: result.model,
        responseRedacted: result.text.slice(0, 8000),
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
        status: "completed",
      },
    });
    await logAuditEvent({
      organizationId: event.organizationId,
      eventId: event.id,
      actorUserId: actor.userId,
      actorType: "ai",
      action: "ai.request",
      entityType: "ai_interaction",
      entityId: interaction.id,
      afterData: { provider: result.provider, model: result.model, tools: executions.map((e) => `${e.toolName}:${e.status}`) },
    });

    const pending = executions.find((e) => e.status === "awaiting_approval");
    return NextResponse.json({
      data: {
        reply: result.text || (pending ? "A change is ready for your approval." : "Done."),
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        toolExecution: pending ?? executions.at(-1) ?? null,
        toolExecutions: executions.map(({ result: _r, ...e }) => (void _r, e)),
      },
    });
  } catch (err) {
    await prisma.aiInteraction.update({ where: { id: interaction.id }, data: { status: "failed" } });
    if (err instanceof AiUnavailableError) throw new HttpError(503, err.message);
    throw err;
  }
});
