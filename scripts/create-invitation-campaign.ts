// Creates the official invitation email campaign for an event, using its
// approved template, on behalf of a super admin, and approves it (super
// admins may self-approve; it is audited as such). It does NOT send:
// press "Send" on the Campaigns page once the guest list is ready. The
// audience is resolved when it is sent, so guests added later are included.
//
//   APP_ENV=production DATABASE_URL=<url> EVENT_CODE=CAROLS-2026 \
//   ADMIN_EMAIL=you@example.org npx tsx scripts/create-invitation-campaign.ts
//
// Optional: CATEGORY_KEY to limit to one protocol category (default: all).
// Refuses if an unsent campaign with the same name already exists.
import { PrismaClient } from "@prisma/client";
import { INVITATION_SUBJECT } from "../src/lib/email/invitation-template";

async function main() {
  const code = process.env.EVENT_CODE?.trim();
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const senderEmail = process.env.RESEND_FROM_EMAIL?.replace(/^.*<([^>]+)>.*$/, "$1").trim();
  const categoryKey = process.env.CATEGORY_KEY?.trim() || "all";
  if (!code || !adminEmail || !senderEmail) {
    console.error("Required: EVENT_CODE, ADMIN_EMAIL, RESEND_FROM_EMAIL");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const event = await prisma.event.findFirst({ where: { eventCode: code } });
  if (!event) throw new Error(`No event with code ${code}.`);
  const admin = await prisma.user.findFirst({
    where: { email: { equals: adminEmail, mode: "insensitive" }, roleAssignments: { some: { revokedAt: null, role: { key: "super_admin" } } } },
  });
  if (!admin) throw new Error(`${adminEmail} is not an active super admin.`);
  const version = await prisma.invitationTemplateVersion.findFirst({
    where: { status: "approved", template: { eventId: event.id, channel: "email" } },
    orderBy: { createdAt: "desc" },
  });
  if (!version) throw new Error("No approved invitation template. Run scripts/ensure-invitation-templates.ts first.");

  const name = categoryKey === "all" ? "Official Invitation: All Dignitaries" : `Official Invitation: ${categoryKey}`;
  const dupe = await prisma.invitationCampaign.findFirst({
    where: { eventId: event.id, name, status: { in: ["draft", "pending_approval", "approved", "scheduled"] } },
  });
  if (dupe) {
    console.log(`"${name}" already exists (${dupe.status}). Nothing to do.`);
    return prisma.$disconnect();
  }

  const now = new Date();
  const campaign = await prisma.invitationCampaign.create({
    data: {
      eventId: event.id,
      name,
      templateVersionId: version.id,
      senderName: "Parliament of Ghana Protocol",
      senderEmail,
      subjectSnapshot: version.subjectTemplate || INVITATION_SUBJECT,
      audienceFilter: JSON.stringify({ categoryKey }),
      audienceCount: 0,
      status: "approved",
      createdBy: admin.id,
      approvedBy: admin.id,
      approvedAt: now,
      approvalNote: "Self-approved by super admin (created via scripts/create-invitation-campaign.ts at the owner's request).",
    },
  });
  for (const action of ["CAMPAIGN_CREATED", "CAMPAIGN_SELF_APPROVED"]) {
    await prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: admin.id,
        actorType: "user",
        action,
        entityType: "invitation_campaign",
        entityId: campaign.id,
        reason: "scripts/create-invitation-campaign.ts",
      },
    });
  }
  await prisma.$disconnect();
  console.log(`Created and approved "${name}" (not sent). Sender: ${senderEmail}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
