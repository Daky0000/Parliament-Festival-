// Gives every event that has no approved invitation email the official
// design (src/lib/email/invitation-template.ts) as an approved version.
// Safe to re-run: events that already have one are left alone.
//
//   APP_ENV=production DATABASE_URL=<url> npx tsx scripts/ensure-invitation-templates.ts
//
// Optional: EVENT_CODE=CAROLS-2026 to limit it to one event.
import { PrismaClient } from "@prisma/client";
import { ensureDefaultInvitationTemplate } from "../src/lib/invitation-defaults";

async function main() {
  const prisma = new PrismaClient();
  const code = process.env.EVENT_CODE?.trim();
  const events = await prisma.event.findMany({ where: code ? { eventCode: code } : {}, orderBy: { createdAt: "asc" } });
  if (events.length === 0) console.log(code ? `No event with code ${code}.` : "No events.");

  for (const event of events) {
    const { versionId, created } = await ensureDefaultInvitationTemplate(
      prisma,
      event.id,
      event.createdBy,
      "Platform default design, approved by operator at the owner's request (scripts/ensure-invitation-templates.ts)."
    );
    if (created) {
      await prisma.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorType: "system",
          action: "template.default_approved",
          entityType: "invitation_template_version",
          entityId: versionId,
          reason: "Default invitation template created and approved via scripts/ensure-invitation-templates.ts",
        },
      });
    }
    console.log(`${event.eventCode}: ${created ? "created and approved the official invitation template" : "already has an approved template"}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
