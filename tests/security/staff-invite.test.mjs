// Inviting a staff member emails them their activation link.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { staffInviteEmail } from "../../src/lib/email/staff-invite.ts";
import { request, call, cookieFor } from "../helpers.mjs";

const users = await import("../../src/app/api/v1/admin/users/route.ts");
const oneUser = await import("../../src/app/api/v1/admin/users/[userId]/route.ts");

test("the invite email carries the activation link, the role and the DakyXTech footer", () => {
  const m = staffInviteEmail({ fullName: "Ama Owusu", roleName: "Usher", eventName: "Carols 2026", activationUrl: "https://x.test/activate/abc", invitedBy: "Kwame Boateng" });
  assert.match(m.html, /href="https:\/\/x\.test\/activate\/abc"/);
  assert.ok(m.html.includes("Ama Owusu") && m.html.includes("Usher") && m.html.includes("Carols 2026"));
  assert.ok(m.html.includes("Powered by") && m.text.includes("https://x.test/activate/abc"));
  assert.ok(!staffInviteEmail({ fullName: "<script>", roleName: "x", eventName: null, activationUrl: "u", invitedBy: null }).html.includes("<script>"), "names are escaped");
});

test("inviting a user sends the email and says so; re-issuing sends it again", async () => {
  const cookie = await cookieFor("admin@parliament.gh");
  const email = `invitee-${Date.now()}@example.org`;
  const r = await call(users.POST, request("/api/v1/admin/users", { method: "POST", cookie, body: { email, fullName: "New Usher", roleKey: "usher" } }));
  assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  assert.strictEqual(r.json.data.emailSent, true);
  assert.strictEqual(r.json.data.emailedTo, email);
  assert.match(r.json.data.activationUrl, /\/activate\//);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "user.invite_emailed", entityId: r.json.data.userId } }));

  const again = await call(oneUser.POST, request(`/api/v1/admin/users/${r.json.data.userId}`, { method: "POST", cookie, body: { action: "reissue_invite" } }), { userId: r.json.data.userId });
  assert.strictEqual(again.status, 200, JSON.stringify(again.json));
  assert.strictEqual(again.json.data.emailSent, true);
});
