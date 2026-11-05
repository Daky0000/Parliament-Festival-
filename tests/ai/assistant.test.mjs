// Phase 6: AI routing, permissions and human approval. Provider HTTP is
// stubbed; nothing reaches OpenAI or Anthropic.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { redactForModel } from "../../src/lib/ai/orchestrator.ts";
import { request, call, cookieFor, seededFixtures } from "../helpers.mjs";

const ai = await import("../../src/app/api/v1/ai/route.ts");
const approvals = await import("../../src/app/api/v1/ai/approvals/[executionId]/route.ts");

function stubProviders(handlers) {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url instanceof Request ? url.url : url);
    seen.push(u);
    const h = handlers.find(([prefix]) => u.startsWith(prefix));
    if (!h) throw new Error(`unexpected fetch ${u}`);
    const [status, body] = await h[1](JSON.parse(init?.body ?? (url instanceof Request ? await url.text() : "{}")));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { seen, restore: () => (globalThis.fetch = original) };
}

function withKeys(fn) {
  return async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_MODEL = "test-openai-model";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    try {
      await fn();
    } finally {
      process.env.OPENAI_API_KEY = "";
      process.env.ANTHROPIC_API_KEY = "";
      delete process.env.OPENAI_MODEL;
    }
  };
}

const openaiAnswer = (text) => [200, { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 7 } }];

test("redaction strips contact details before anything reaches a provider", () => {
  const out = redactForModel({ fullName: "Hon. A", email: "a@b.gh", phone: "+233241234567", note: "call 024 123 4567 or a@b.gh" });
  assert.deepStrictEqual(Object.keys(out).sort(), ["fullName", "note"]);
  assert.strictEqual(out.note, "call [phone] or [email]");
});

test("no configured provider: the request fails honestly (503), no canned answer", async () => {
  const f = await seededFixtures();
  const r = await call(ai.POST, request("/api/v1/ai", { method: "POST", cookie: await cookieFor("admin@parliament.gh"), body: { eventId: f.event.id, message: "Summarise RSVPs" } }));
  assert.strictEqual(r.status, 503);
});

test("ushers cannot use the assistant", async () => {
  const f = await seededFixtures();
  const r = await call(ai.POST, request("/api/v1/ai", { method: "POST", cookie: await cookieFor("usher@parliament.gh"), body: { eventId: f.event.id, message: "x" } }));
  assert.strictEqual(r.status, 403);
});

test("tools run with the server's event id and real usage is logged", withKeys(async () => {
  const f = await seededFixtures();
  let round = 0;
  const s = stubProviders([
    ["https://api.openai.com/", async (body) => {
      round++;
      if (round === 1) {
        assert.ok(!JSON.stringify(body.tools).includes("eventId"), "the model cannot choose the event");
        return [200, { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "list_pending_rsvps", arguments: "{}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 5 } }];
      }
      const toolMsg = body.messages.find((m) => m.role === "tool");
      assert.ok(toolMsg && !/@/.test(toolMsg.content), "tool output is redacted");
      return openaiAnswer("There are pending RSVPs.");
    }],
  ]);
  try {
    const r = await call(ai.POST, request("/api/v1/ai", { method: "POST", cookie: await cookieFor("admin@parliament.gh"), body: { eventId: f.event.id, message: "Who has not replied?" } }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.provider, "openai");
    assert.strictEqual(r.json.data.reply, "There are pending RSVPs.");
    const usage = await prisma.aiUsageLog.findFirst({ where: { eventId: f.event.id, provider: "openai" }, orderBy: { createdAt: "desc" } });
    assert.strictEqual(usage.inputTokens, 31);
    assert.strictEqual(usage.outputTokens, 12);
    assert.strictEqual(usage.actualCost, null, "no invented cost without a configured price");
  } finally {
    s.restore();
  }
}));

test("OpenAI failure falls back to Claude (the configured secondary)", withKeys(async () => {
  const f = await seededFixtures();
  const s = stubProviders([
    ["https://api.openai.com/", async () => [503, { error: { message: "down" } }]],
    ["https://api.anthropic.com/", async (body) => {
      assert.strictEqual(body.model, "claude-opus-5-5");
      return [200, { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "Answer from Claude." }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 9, output_tokens: 4 } }];
    }],
  ]);
  try {
    const r = await call(ai.POST, request("/api/v1/ai", { method: "POST", cookie: await cookieFor("admin@parliament.gh"), body: { eventId: f.event.id, message: "Summarise" } }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.provider, "anthropic");
    assert.strictEqual(r.json.data.fallbackUsed, true);
    assert.ok(await prisma.aiUsageLog.findFirst({ where: { provider: "openai", status: "failed" } }));
  } finally {
    s.restore();
  }
}));

test("write tools wait for approval; approval runs the stored request once", withKeys(async () => {
  const f = await seededFixtures();
  let round = 0;
  const s = stubProviders([
    ["https://api.openai.com/", async () => {
      round++;
      return round === 1
        ? [200, { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "propose_seating_allocation", arguments: JSON.stringify({ seatingPlanId: f.plan.id }) } }] }, finish_reason: "tool_calls" }], usage: {} }]
        : openaiAnswer("The seating change is awaiting your approval.");
    }],
  ]);
  let executionId;
  try {
    const before = await prisma.seatAssignment.count();
    const r = await call(ai.POST, request("/api/v1/ai", { method: "POST", cookie: await cookieFor("admin@parliament.gh"), body: { eventId: f.event.id, message: "Seat everyone" } }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.toolExecution.status, "awaiting_approval");
    executionId = r.json.data.toolExecution.executionId;
    assert.strictEqual(await prisma.seatAssignment.count(), before, "nothing changed before approval");
  } finally {
    s.restore();
  }

  const usher = await call(approvals.POST, request(`/api/v1/ai/approvals/${executionId}`, { method: "POST", cookie: await cookieFor("usher@parliament.gh"), body: { decision: "approve" } }), { executionId });
  assert.ok([403, 404].includes(usher.status), "an usher cannot approve seating changes");

  const seating = await cookieFor("seating@parliament.gh");
  const ok = await call(approvals.POST, request(`/api/v1/ai/approvals/${executionId}`, { method: "POST", cookie: seating, body: { decision: "approve" } }), { executionId });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  assert.strictEqual(ok.json.data.status, "completed");
  const again = await call(approvals.POST, request(`/api/v1/ai/approvals/${executionId}`, { method: "POST", cookie: seating, body: { decision: "approve" } }), { executionId });
  assert.strictEqual(again.status, 409, "decided once");
}));
