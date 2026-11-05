// Phase 3: truthful email sending and verified webhooks.
import test from "node:test";
import assert from "node:assert";
import { Webhook } from "svix";
import { prisma } from "../../src/lib/db.ts";
import { sendViaResend } from "../../src/lib/email/resend.ts";
import { sendInvitationEmail } from "../../src/lib/email/provider.ts";
import { issueInvitation } from "../../src/lib/guest-tokens.ts";
import { request, call, seededFixtures } from "../helpers.mjs";

const WEBHOOK_SECRET = "whsec_" + Buffer.from("test-webhook-secret-0123456789ab").toString("base64");
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
const webhookRoute = await import("../../src/app/api/v1/webhooks/email/route.ts");

function stubFetch(status, body) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

const msg = { from: "Office <office@example.org>", to: "guest@example.org", subject: "s", html: "<p>h</p>", text: "t", idempotencyKey: "key-1" };

test("Resend adapter: only 2xx with an id counts as accepted; errors are classified", async () => {
  let s = stubFetch(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  assert.deepStrictEqual(await sendViaResend("re_test", msg), { ok: true, providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });
  assert.strictEqual(s.calls[0].init.headers["Idempotency-Key"], "key-1");
  s.restore();

  for (const [status, retryable] of [[500, true], [503, true], [429, true], [422, false], [403, false]]) {
    s = stubFetch(status, { name: "error", message: "boom" });
    const r = await sendViaResend("re_test", msg);
    s.restore();
    assert.strictEqual(r.ok, false, `HTTP ${status}`);
    assert.strictEqual(r.retryable, retryable, `HTTP ${status} retryable`);
  }

  s = stubFetch(200, {});
  const noId = await sendViaResend("re_test", msg);
  s.restore();
  assert.strictEqual(noId.ok, false, "2xx without an id is not success");
});

async function makeInvitation() {
  const f = await seededFixtures();
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id } } });
  return (
    await issueInvitation(prisma, {
      eventId: f.event.id,
      eventGuestId: f.guest.id,
      templateVersionId: version.id,
      recipientEmailSnapshot: "guest@example.org",
      recipientNameSnapshot: "Guest",
      invitationStatus: "queued",
    })
  ).invitation;
}

test("a provider error is recorded as failed, never as sent", async () => {
  const inv = await makeInvitation();
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Office <office@example.org>";
  const s = stubFetch(500, { name: "internal_server_error", message: "down" });
  try {
    const r = await sendInvitationEmail({
      invitationId: inv.id, recipientEmail: "guest@example.org", recipientName: "Guest",
      subject: "s", htmlContent: "h", textContent: "t", idempotencyKey: `k-${inv.id}`,
    });
    assert.strictEqual(r.ok, false);
  } finally {
    s.restore();
    process.env.EMAIL_PROVIDER = "mock";
    process.env.RESEND_API_KEY = "";
  }
  const attempt = await prisma.emailAttempt.findFirstOrThrow({ where: { invitationId: inv.id } });
  assert.strictEqual(attempt.status, "failed");
  assert.strictEqual(attempt.providerMessageId, null, "no fabricated message id");
  assert.notStrictEqual((await prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } })).invitationStatus, "sent");
});

function signed(event, id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
  const payload = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(WEBHOOK_SECRET).sign(id, timestamp, payload);
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
    "content-type": "application/json",
  });
  return { id, req: new Request("http://localhost:3000/api/v1/webhooks/email", { method: "POST", headers, body: payload }) };
}

test("webhooks: forged signatures are rejected; valid ones update state once", async () => {
  const forged = new Request("http://localhost:3000/api/v1/webhooks/email", {
    method: "POST",
    headers: { "svix-id": "x", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,AAAA" },
    body: JSON.stringify({ type: "email.delivered", data: { email_id: "x" } }),
  });
  assert.strictEqual((await call(webhookRoute.POST, forged)).status, 401);

  const inv = await makeInvitation();
  const emailId = `em_${Date.now()}`;
  await prisma.emailAttempt.create({
    data: { invitationId: inv.id, attemptNumber: 1, provider: "resend", providerMessageId: emailId, recipientEmail: "bounce@example.org", status: "submitted" },
  });

  const delivered = signed({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: emailId } });
  assert.strictEqual((await call(webhookRoute.POST, delivered.req)).json.outcome, "processed");
  const replay = signed({ type: "email.delivered", data: { email_id: emailId } }, delivered.id);
  assert.strictEqual((await call(webhookRoute.POST, replay.req)).json.outcome, "duplicate");

  const bounced = signed({ type: "email.bounced", data: { email_id: emailId, bounce: { type: "Permanent", subType: "General" } } });
  await call(webhookRoute.POST, bounced.req);
  const lateDelivered = signed({ type: "email.delivered", data: { email_id: emailId } });
  await call(webhookRoute.POST, lateDelivered.req);

  const attempt = await prisma.emailAttempt.findFirstOrThrow({ where: { providerMessageId: emailId } });
  assert.strictEqual(attempt.status, "bounced", "a late 'delivered' never downgrades a bounce");
  assert.ok(await prisma.suppression.findUnique({ where: { channel_address: { channel: "email", address: "bounce@example.org" } } }));

  const opened = signed({ type: "email.opened", data: { email_id: emailId } });
  await call(webhookRoute.POST, opened.req);
  assert.strictEqual((await prisma.emailAttempt.findFirstOrThrow({ where: { providerMessageId: emailId } })).status, "bounced", "opens are engagement only");
});

test("the cron tick route is hidden without the secret", async () => {
  const tick = await import("../../src/app/api/internal/tick/route.ts");
  assert.strictEqual((await call(tick.POST, request("/api/internal/tick", { method: "POST" }))).status, 404);
});
