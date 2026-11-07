import test from "node:test";
import assert from "node:assert";
import {
  renderUserInviteHtml,
  renderUserInviteText,
  sendUserInviteEmail,
} from "../../src/lib/email/user-invite.ts";

function stubFetch(status, body) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("User invite email: HTML and plain text render correctly", () => {
  const params = {
    to: "usher1@example.org",
    fullName: "Kofi Mensah",
    roleName: "Usher",
    eventName: "Festival of Nine Lessons and Carols 2026",
    activationUrl: "https://platform.parliament.gh/activate/test-token-12345",
    inviterName: "Speaker Secretariat",
  };

  const text = renderUserInviteText(params);
  assert.ok(text.includes("Dear Kofi Mensah"));
  assert.ok(text.includes("Role: Usher"));
  assert.ok(text.includes("Festival of Nine Lessons and Carols 2026"));
  assert.ok(text.includes("https://platform.parliament.gh/activate/test-token-12345"));
  assert.ok(text.includes("72 hours"));

  const html = renderUserInviteHtml(params);
  assert.ok(html.includes("Kofi Mensah"));
  assert.ok(html.includes("Usher"));
  assert.ok(html.includes("Festival of Nine Lessons and Carols 2026"));
  assert.ok(html.includes("https://platform.parliament.gh/activate/test-token-12345"));
  assert.ok(html.includes("72 hours"));
  assert.ok(html.includes("Parliament of Ghana"));
});

test("User invite email: mock provider returns success without sending", async () => {
  process.env.EMAIL_PROVIDER = "mock";
  const r = await sendUserInviteEmail({
    to: "mockuser@example.org",
    fullName: "Mock User",
    roleName: "Admin",
    activationUrl: "https://platform.parliament.gh/activate/abc",
  });
  assert.strictEqual(r.ok, true);
  assert.ok(r.providerMessageId?.startsWith("mock_user_invite_"));
});

test("User invite email: Resend provider dispatches and handles responses", async () => {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "Parliament Protocol <protocol@parliament.gh>";

  try {
    // 1. Successful Resend response
    const s1 = stubFetch(200, { id: "resend-msg-12345" });
    const success = await sendUserInviteEmail({
      to: "invited@example.org",
      fullName: "Invited Staff",
      roleName: "Protocol Officer",
      activationUrl: "https://platform.parliament.gh/activate/xyz-999",
      inviterName: "Admin",
    });
    s1.restore();

    assert.strictEqual(success.ok, true);
    assert.strictEqual(success.providerMessageId, "resend-msg-12345");
    assert.strictEqual(s1.calls.length, 1);
    const body = JSON.parse(s1.calls[0].init.body);
    assert.strictEqual(body.to[0], "invited@example.org");
    assert.strictEqual(body.from, "Parliament Protocol <protocol@parliament.gh>");
    assert.ok(body.html.includes("Invited Staff"));

    // 2. Resend error response (e.g. sandbox 403)
    const s2 = stubFetch(403, {
      message: "You can only send testing emails to your own email address.",
      name: "validation_error",
      statusCode: 403,
    });
    const failed = await sendUserInviteEmail({
      to: "external@example.org",
      fullName: "External Person",
      roleName: "Usher",
      activationUrl: "https://platform.parliament.gh/activate/fail-123",
    });
    s2.restore();

    assert.strictEqual(failed.ok, false);
    assert.ok(failed.message?.includes("You can only send testing emails"));
  } finally {
    process.env.EMAIL_PROVIDER = "mock";
    process.env.RESEND_API_KEY = "";
  }
});
