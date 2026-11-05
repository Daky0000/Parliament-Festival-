import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { getProviderSecret } from "../integrations";

// AI provider routing. Priority: OpenAI (primary) -> Anthropic Claude
// (secondary), each used only when configured, enabled and not over budget.
// There is no fake fallback: if no permitted provider answers, the call
// fails and the caller shows that. Usage and cost come only from what the
// provider reports; cost is computed only where the per-token price is known.
// ChatGPT (the consumer app) is never called; the UI offers a manual
// "copy prompt" fallback instead.

export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolRunner = (call: ToolCall) => Promise<unknown>;

export type AgentResult = {
  provider: "openai" | "anthropic";
  model: string;
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  fallbackUsed: boolean;
  stopReason: string | null;
};

export class AiUnavailableError extends Error {}

const CLAUDE_DEFAULT_MODEL = "claude-opus-5-5";
// Per 1M tokens, from Anthropic's published price list. OpenAI prices are
// not hardcoded; set AI_OPENAI_PRICE_IN / _OUT (USD per 1M) to record cost.
const CLAUDE_PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

function costUsd(provider: string, model: string, usage: AgentResult["usage"]): number | null {
  const p =
    provider === "anthropic"
      ? CLAUDE_PRICES[model]
      : process.env.AI_OPENAI_PRICE_IN && process.env.AI_OPENAI_PRICE_OUT
        ? { in: Number(process.env.AI_OPENAI_PRICE_IN), out: Number(process.env.AI_OPENAI_PRICE_OUT) }
        : undefined;
  return p ? (usage.inputTokens * p.in + usage.outputTokens * p.out) / 1_000_000 : null;
}

type ProviderChoice = { provider: "openai" | "anthropic"; model: string; apiKey: string; timeoutMs: number; maxOutputTokens: number };

/** Ordered list of providers allowed for this task right now. */
export async function permittedProviders(taskKey: string): Promise<ProviderChoice[]> {
  if (process.env.AI_DISABLED === "true") return [];
  const integrations = await prisma.platformIntegration.findMany({ where: { providerKey: { in: ["openai", "anthropic"] } } });
  const enabled = (k: string) => integrations.find((i) => i.providerKey === k)?.isEnabled !== false;
  const configs = await prisma.aiProviderConfig.findMany({ where: { taskKey, isEnabled: true }, orderBy: { priority: "asc" } });
  const cfg = (provider: string) => configs.find((c) => c.provider === provider);

  const out: ProviderChoice[] = [];
  const openaiKey = await getProviderSecret("openai");
  const openaiModel = cfg("openai")?.model || process.env.OPENAI_MODEL;
  if (openaiKey && openaiModel && enabled("openai")) {
    out.push({ provider: "openai", model: openaiModel, apiKey: openaiKey, timeoutMs: cfg("openai")?.timeoutMs ?? 30_000, maxOutputTokens: cfg("openai")?.maxOutputTokens ?? 2000 });
  }
  const anthropicKey = await getProviderSecret("anthropic");
  if (anthropicKey && enabled("anthropic") && process.env.AI_CLAUDE_FALLBACK !== "false") {
    const model = cfg("anthropic")?.model && !/claude-3/.test(cfg("anthropic")!.model) ? cfg("anthropic")!.model : CLAUDE_DEFAULT_MODEL;
    out.push({ provider: "anthropic", model, apiKey: anthropicKey, timeoutMs: cfg("anthropic")?.timeoutMs ?? 60_000, maxOutputTokens: Math.max(cfg("anthropic")?.maxOutputTokens ?? 0, 4000) });
  }
  return out;
}

/** Refuses when today's recorded spend/tokens exceed the configured budget. */
export async function assertWithinBudget(eventId: string | null): Promise<void> {
  const tokenBudget = Number(process.env.AI_DAILY_TOKEN_BUDGET || 0);
  if (!tokenBudget) return;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.aiUsageLog.aggregate({
    where: { createdAt: { gte: since }, ...(eventId ? { eventId } : {}) },
    _sum: { inputTokens: true, outputTokens: true },
  });
  const used = (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
  if (used >= tokenBudget) throw new AiUnavailableError("Today's AI budget has been reached.");
}

// ---- OpenAI (Chat Completions with function tools), raw HTTPS ----------

async function runOpenAi(c: ProviderChoice, system: string, userText: string, tools: ToolSpec[], runTool: ToolRunner, maxRounds: number) {
  type Msg = Record<string, unknown>;
  const messages: Msg[] = [
    { role: "system", content: system },
    { role: "user", content: userText },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const allCalls: ToolCall[] = [];
  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: c.model,
        messages,
        max_completion_tokens: c.maxOutputTokens,
        ...(tools.length ? { tools: tools.map((t) => ({ type: "function", function: t })), tool_choice: "auto" } : {}),
      }),
      signal: AbortSignal.timeout(c.timeoutMs),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const body = (await res.json()) as {
      choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    usage.inputTokens += body.usage?.prompt_tokens ?? 0;
    usage.outputTokens += body.usage?.completion_tokens ?? 0;
    const msg = body.choices[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    const calls = (msg.tool_calls ?? []).map((tc) => ({ id: tc.id, name: tc.function.name, input: safeJson(tc.function.arguments) }));
    if (!calls.length) return { text: msg.content ?? "", toolCalls: allCalls, usage, stopReason: body.choices[0].finish_reason };
    messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
    for (const call of calls) {
      allCalls.push(call);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(await runTool(call)) });
    }
  }
  return { text: "", toolCalls: allCalls, usage, stopReason: "max_rounds" };
}

// ---- Anthropic (official SDK, Messages API with client tools) ------------

async function runClaude(c: ProviderChoice, system: string, userText: string, tools: ToolSpec[], runTool: ToolRunner, maxRounds: number) {
  const client = new Anthropic({ apiKey: c.apiKey, timeout: c.timeoutMs, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userText }];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const allCalls: ToolCall[] = [];
  for (let round = 0; round < maxRounds; round++) {
    const response = await client.beta.messages.create({
      model: c.model,
      max_tokens: c.maxOutputTokens,
      system,
      messages,
      output_config: { effort: "medium" },
      // On a policy refusal the API retries on a fallback model it chooses.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(tools.length
        ? {
            tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema })),
            tool_choice: { type: "auto" as const },
          }
        : {}),
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    if (response.stop_reason === "refusal") {
      return { text: "The assistant declined this request.", toolCalls: allCalls, usage, stopReason: "refusal" };
    }
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { text, toolCalls: allCalls, usage, stopReason: response.stop_reason };
    }
    // Pass the assistant content back unchanged (keeps thinking blocks valid).
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const call = { id: tu.id, name: tu.name, input: (tu.input ?? {}) as Record<string, unknown> };
      allCalls.push(call);
      try {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(await runTool(call)) });
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: String((err as Error).message), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", toolCalls: allCalls, usage, stopReason: "max_rounds" };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * Runs a tool-using request on the first permitted provider; on failure
 * (network, HTTP error, timeout) retries the whole request once on the next
 * permitted provider. Records actual usage per attempt.
 */
export async function runAgent(opts: {
  taskKey: string;
  eventId: string | null;
  system: string;
  userText: string;
  tools: ToolSpec[];
  runTool: ToolRunner;
  maxRounds?: number;
}): Promise<AgentResult> {
  await assertWithinBudget(opts.eventId);
  const providers = await permittedProviders(opts.taskKey);
  if (!providers.length) throw new AiUnavailableError("No AI provider is configured or enabled.");

  let lastError: unknown = null;
  for (let i = 0; i < providers.length; i++) {
    const c = providers[i];
    const started = Date.now();
    try {
      const run = c.provider === "openai" ? runOpenAi : runClaude;
      const r = await run(c, opts.system, opts.userText, opts.tools, opts.runTool, opts.maxRounds ?? 4);
      const latencyMs = Date.now() - started;
      const cost = costUsd(c.provider, c.model, r.usage);
      await prisma.aiUsageLog.create({
        data: {
          eventId: opts.eventId, provider: c.provider, model: c.model, taskKey: opts.taskKey,
          inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens,
          estimatedCost: cost ?? 0, actualCost: cost, latencyMs, status: i > 0 ? "fallback_triggered" : "success", fallbackUsed: i > 0,
        },
      });
      return { provider: c.provider, model: c.model, ...r, latencyMs, fallbackUsed: i > 0 };
    } catch (err) {
      lastError = err;
      await prisma.aiUsageLog.create({
        data: { eventId: opts.eventId, provider: c.provider, model: c.model, taskKey: opts.taskKey, latencyMs: Date.now() - started, status: "failed", fallbackUsed: i > 0 },
      });
    }
  }
  console.error("All AI providers failed", lastError);
  throw new AiUnavailableError("The AI service is unavailable right now. Try again later.");
}
