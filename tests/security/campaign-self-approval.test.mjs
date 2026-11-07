// Campaign four-eyes rule: a creator cannot approve their own campaign,
// except a super admin (owner decision 2026-11-07), which is audited.
import test from "node:test";
import assert from "node:assert";
import { prisma } from "../../src/lib/db.ts";
import { syncRoles } from "../../src/lib/roles.ts";
import { request, call, cookieFor, seededFixtures, userByEmail } from "../helpers.mjs";

const campaignOne = await import("../../src/app/api/v1/campaigns/[campaignId]/route.ts");

async function pendingCampaign(eventId, createdBy) {
  const version = await prisma.invitationTemplateVersion.findFirstOrThrow({ where: { template: { eventId }, status: "approved" } });
  return prisma.invitationCampaign.create({
    data: {
      eventId, templateVersionId: version.id, name: `Self-approval ${Date.now()}`, senderName: "Office",
      senderEmail: "office@example.org", subjectSnapshot: "Invitation", status: "pending_approval", createdBy,
    },
  });
}

const approve = (campaignId, cookie) =>
  call(campaignOne.PATCH, request(`/api/v1/campaigns/${campaignId}`, { method: "PATCH", cookie, body: { action: "approve" } }), { campaignId });

test("an Event Owner (not super admin) cannot approve their own campaign", async () => {
  const f = await seededFixtures();
  const roleIds = await syncRoles(prisma, f.event.organizationId);
  const email = `owner-${Date.now()}@example.org`;
  const owner = await prisma.user.create({ data: { organizationId: f.event.organizationId, email, fullName: "Event Owner", status: "active" } });
  await prisma.userRoleAssignment.create({ data: { userId: owner.id, roleId: roleIds.admin } });

  const campaign = await pendingCampaign(f.event.id, owner.id);
  const res = await approve(campaign.id, await cookieFor(email));
  assert.strictEqual(res.status, 403);
  assert.strictEqual((await prisma.invitationCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "pending_approval");
});

test("a super admin may approve their own campaign, and it is audited as a self-approval", async () => {
  const f = await seededFixtures();
  const admin = await userByEmail("admin@parliament.gh");
  const campaign = await pendingCampaign(f.event.id, admin.id);
  const res = await approve(campaign.id, await cookieFor("admin@parliament.gh"));
  assert.strictEqual(res.status, 200, JSON.stringify(res.json));
  assert.strictEqual(res.json.data.status, "approved");
  const log = await prisma.auditLog.findFirst({ where: { entityId: campaign.id, action: "CAMPAIGN_SELF_APPROVED" } });
  assert.ok(log, "self-approval is recorded");
});
