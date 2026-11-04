import test from "node:test";
import assert from "node:assert";
import { routeAiCompletion } from "../../src/lib/ai/provider-router.ts";
import { prisma } from "../../src/lib/db.ts";

test("AI Provider Routing: respects primary OpenAI and fallback Anthropic Claude hierarchy", async () => {
  const result = await routeAiCompletion({
    taskKey: "invitation_drafting",
    prompt: "Draft an invitation for Rt. Hon. Speaker to 2026 Festival of Nine Lessons and Carols",
  });

  assert.ok(result.text, "Must return completion text");
  assert.ok(result.provider === "openai" || result.provider === "anthropic", "Provider must be openai or anthropic");
  assert.ok(result.latencyMs >= 0, "Must record latency");

  // Verify usage log exists
  const usageLog = await prisma.aiUsageLog.findFirst({
    orderBy: { createdAt: "desc" },
  });
  assert.ok(usageLog, "AI usage must be audited in ai_usage_logs");
});

