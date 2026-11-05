// Phase 4: usher check-in (spec §11.14 acceptance criteria).
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { verifyScan } from "../../src/lib/checkin.ts";
import { actorFromSession } from "../../src/lib/authz.ts";
import { createSession } from "../../src/lib/session.ts";
import { ensureActiveCredential, issueInvitation, scanUrl } from "../../src/lib/guest-tokens.ts";
import { syncRoles } from "../../src/lib/roles.ts";
import { request, call, cookieFor, seededFixtures, userByEmail } from "../helpers.mjs";

const confirmRoute = await import("../../src/app/api/v1/check-in/confirm/route.ts");
const lookupRoute = await import("../../src/app/api/v1/check-in/lookup/route.ts");
const reverseRoute = await import("../../src/app/api/v1/check-in/reverse/route.ts");
const summaryRoute = await import("../../src/app/api/v1/attendance/summary/route.ts");

async function actorFor(email) {
  const u = await userByEmail(email);
  return actorFromSession((await createSession(u.id, { mfaPending: false })).session);
}

async function guestWithPass({ response = "accepted" } = {}) {
  const f = await seededFixtures();
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId: f.event.id } } });
  const person = await prisma.person.create({ data: { organizationId: f.event.organizationId, fullName: `Scan Guest ${Date.now()}`, title: "Hon." } });
  const guest = await prisma.eventGuest.create({
    data: { eventId: f.event.id, personId: person.id, guestReference: `S-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, guestStatus: "active", companionAllowance: 1 },
  });
  const { invitation } = await issueInvitation(prisma, {
    eventId: f.event.id, eventGuestId: guest.id, templateVersionId: version.id,
    recipientEmailSnapshot: "g@example.org", recipientNameSnapshot: person.fullName, invitationStatus: "sent",
  });
  await prisma.rsvp.create({ data: { invitationId: invitation.id, response, companionCount: response === "accepted" ? 1 : 0, confirmationReference: `R-${guest.id}` } });
  const cred = await ensureActiveCredential(prisma, { invitationId: invitation.id, eventId: f.event.id, expiresAt: null });
  const mainGate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "MAIN" } });
  const vipGate = await prisma.gate.findFirstOrThrow({ where: { eventId: f.event.id, code: "VIP" } });
  return { f, guest, invitation, token: cred.rawToken, credId: cred.id, mainGate, vipGate };
}

const confirm = (cookie, body) => call(confirmRoute.POST, request("/api/v1/check-in/confirm", { method: "POST", cookie, body }));

test("the QR encodes an https scan URL with an opaque token, no personal data", async () => {
  const { token } = await guestWithPass();
  const url = scanUrl(token);
  assert.match(url, /^http:\/\/localhost:3000\/check-in\/scan\/[A-Za-z0-9_-]{43}$/);
});

test("scanning verifies and shows the welcome card without recording anything", async () => {
  const { guest, token, mainGate } = await guestWithPass();
  const usher = await actorFor("usher@parliament.gh");
  const before = await prisma.attendanceRecord.count();
  const scan = await verifyScan(usher, token, mainGate.id);
  assert.strictEqual(scan.state, "VALID");
  assert.strictEqual(scan.guest.eventGuestId, guest.id);
  assert.strictEqual(scan.guest.companionsExpected, 1);
  assert.ok(!("email" in scan.guest) && !("phone" in scan.guest), "no contact details for ushers");
  assert.strictEqual(await prisma.attendanceRecord.count(), before, "a scan alone never records attendance");
});

test("invalid, revoked and expired passes show the right state", async () => {
  const usher = await actorFor("usher@parliament.gh");
  const a = await guestWithPass();
  assert.strictEqual((await verifyScan(usher, "x".repeat(43), a.mainGate.id)).state, "INVALID");
  await prisma.qrCredential.update({ where: { id: a.credId }, data: { status: "revoked" } });
  assert.strictEqual((await verifyScan(usher, a.token, a.mainGate.id)).state, "REVOKED");
  const b = await guestWithPass();
  await prisma.qrCredential.update({ where: { id: b.credId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.strictEqual((await verifyScan(usher, b.token, b.mainGate.id)).state, "EXPIRED");
  const c = await guestWithPass({ response: "declined" });
  assert.strictEqual((await verifyScan(usher, c.token, c.mainGate.id)).state, "RSVP_DECLINED");
});

test("gates never block: an usher can verify and confirm at any gate or none", async () => {
  const { f, token, vipGate } = await guestWithPass();
  const cookie = await cookieFor("usher@parliament.gh");
  const usher = await actorFor("usher@parliament.gh");
  const v = await verifyScan(usher, token, vipGate.id);
  assert.strictEqual(v.state, "VALID", "an unassigned gate does not block verification");
  assert.ok(v.guest.displayName && "rsvp" in v.guest);
  const noGate = await verifyScan(usher, token, null);
  assert.strictEqual(noGate.state, "VALID", "no gate selected is fine");
  const ok = await confirm(cookie, { eventId: f.event.id, gateId: vipGate.id, token, method: "qr" });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  const rec = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: ok.json.data.attendanceId } });
  assert.strictEqual(rec.gateId, vipGate.id, "the gate is still recorded for reports");
  assert.strictEqual(rec.checkedInBy, (await userByEmail("usher@parliament.gh")).id);
  assert.strictEqual(rec.checkinMethod, "qr");
});

test("a second scan shows the original check-in instead of recording again", async () => {
  const { f, token, mainGate } = await guestWithPass();
  const cookie = await cookieFor("usher@parliament.gh");
  await confirm(cookie, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr" });
  const usher = await actorFor("usher@parliament.gh");
  const again = await verifyScan(usher, token, mainGate.id);
  assert.strictEqual(again.state, "ALREADY_CHECKED_IN");
  assert.strictEqual(again.existing.gateName, mainGate.name);
  const dup = await confirm(cookie, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr" });
  assert.strictEqual(dup.json.data.state, "ALREADY_CHECKED_IN");
});

test("an usher from another event or organization cannot use the pass", async () => {
  const { f, token, mainGate } = await guestWithPass();
  const otherOrg = await prisma.organization.create({ data: { name: "Other", slug: `o-${Date.now()}` } });
  const roleIds = await syncRoles(prisma, otherOrg.id);
  const stranger = await prisma.user.create({ data: { organizationId: otherOrg.id, email: `stranger-${Date.now()}@example.org`, fullName: "Stranger", status: "active" } });
  await prisma.userRoleAssignment.create({ data: { userId: stranger.id, roleId: roleIds.usher } });
  const actor = await actorFromSession((await createSession(stranger.id, { mfaPending: false })).session);
  assert.strictEqual((await verifyScan(actor, token, mainGate.id)).state, "INVALID", "no cross-org disclosure");
  const { rawToken } = await createSession(stranger.id, { mfaPending: false });
  const r = await confirm(`pf_session=${rawToken}`, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr" });
  assert.ok([403, 404].includes(r.status));
});

test("declined guests need a supervisor override with a reason; overrides are audited", async () => {
  const { f, token, mainGate } = await guestWithPass({ response: "declined" });
  const usherCookie = await cookieFor("usher@parliament.gh");
  const supervisorCookie = await cookieFor("supervisor@parliament.gh");
  assert.strictEqual((await confirm(usherCookie, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr" })).json.data.state, "RSVP_DECLINED");
  const usherOverride = await confirm(usherCookie, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr", overrideReason: "Guest changed mind" });
  assert.strictEqual(usherOverride.status, 403, "ushers cannot override");
  const ok = await confirm(supervisorCookie, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr", overrideReason: "Guest changed mind, protocol approved" });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  const rec = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: ok.json.data.attendanceId } });
  assert.strictEqual(rec.checkinMethod, "supervisor_override");
  assert.ok(rec.overrideReason);
  assert.strictEqual(await prisma.auditLog.count({ where: { entityId: rec.id, action: "checkin.override" } }), 1);

  // Supervisor reversal keeps history.
  const rev = await call(reverseRoute.POST, request("/api/v1/check-in/reverse", { method: "POST", cookie: supervisorCookie, body: { attendanceId: rec.id, reason: "Wrong guest admitted" } }));
  assert.strictEqual(rev.status, 200);
  const after = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: rec.id } });
  assert.strictEqual(after.checkinStatus, "reversed");
  const usherReverse = await call(reverseRoute.POST, request("/api/v1/check-in/reverse", { method: "POST", cookie: usherCookie, body: { attendanceId: rec.id, reason: "trying" } }));
  assert.strictEqual(usherReverse.status, 404);
});

test("check-in is refused outside the window unless overridden", async () => {
  const { f, token, mainGate } = await guestWithPass();
  const cookie = await cookieFor("usher@parliament.gh");
  await prisma.event.update({ where: { id: f.event.id }, data: { checkinOpensAt: new Date(Date.now() + 3600_000) } });
  try {
    const r = await confirm(cookie, { eventId: f.event.id, gateId: mainGate.id, token, method: "qr" });
    assert.strictEqual(r.json.data.state, "EVENT_NOT_ACTIVE");
  } finally {
    await prisma.event.update({ where: { id: f.event.id }, data: { checkinOpensAt: null } });
  }
});

test("manual lookup is event-scoped and returns usher-safe fields only", async () => {
  const { f, guest } = await guestWithPass();
  const cookie = await cookieFor("usher@parliament.gh");
  const r = await call(lookupRoute.GET, request(`/api/v1/check-in/lookup?eventId=${f.event.id}&q=${encodeURIComponent(guest.guestReference)}`, { cookie }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.data.length, 1);
  assert.deepStrictEqual(Object.keys(r.json.data[0]).sort(), ["category", "companionsExpected", "designation", "displayName", "eventGuestId", "institution", "reference", "rsvp", "seat", "title"]);
});

test("the live summary is for supervisors and staff, not ushers", async () => {
  const { f } = await guestWithPass();
  const usher = await call(summaryRoute.GET, request(`/api/v1/attendance/summary?eventId=${f.event.id}`, { cookie: await cookieFor("usher@parliament.gh") }));
  assert.strictEqual(usher.status, 403);
  const sup = await call(summaryRoute.GET, request(`/api/v1/attendance/summary?eventId=${f.event.id}`, { cookie: await cookieFor("supervisor@parliament.gh") }));
  assert.strictEqual(sup.status, 200, JSON.stringify(sup.json));
  assert.ok(sup.json.data.checkedIn >= 1);
  assert.ok("already_checked_in" in sup.json.data.attempts);
});
