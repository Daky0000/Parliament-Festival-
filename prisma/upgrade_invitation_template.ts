// Stores the invitation email in src/lib/email/invitation-template.ts as a new
// approved version of every email invitation template, retires the older
// versions, and moves campaigns that have not been sent yet onto it.
// Campaigns already sending or sent keep the version they used.
//
// Run: npx tsx prisma/upgrade_invitation_template.ts
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import {
  INVITATION_HTML,
  INVITATION_SUBJECT,
  INVITATION_TEXT,
  INVITATION_TEMPLATE_VERSION_NOTE,
} from "../src/lib/email/invitation-template";

const prisma = new PrismaClient();

// Statuses where nothing has gone out yet
const NOT_SENT = ["draft", "validating", "pending_approval", "approved", "scheduled"];

async function main() {
  const sha = crypto.createHash("sha256").update(INVITATION_HTML).digest("hex");
  const templates = await prisma.invitationTemplate.findMany({
    where: { channel: "email" },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (templates.length === 0) {
    console.log("No email invitation templates found. Run the seed first.");
    return;
  }

  for (const t of templates) {
    const latest = t.versions[0];
    if (latest && latest.contentSha256 === sha && latest.status === "approved") {
      console.log(`"${t.name}": already on this design (v${latest.versionNumber}).`);
      continue;
    }

    const version = await prisma.invitationTemplateVersion.create({
      data: {
        templateId: t.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        subjectTemplate: INVITATION_SUBJECT,
        htmlContent: INVITATION_HTML,
        textContent: INVITATION_TEXT,
        status: "approved",
        createdBy: latest?.createdBy ?? null,
        approvedBy: latest?.approvedBy ?? null,
        approvedAt: new Date(),
        approvalNote: INVITATION_TEMPLATE_VERSION_NOTE,
        contentSha256: sha,
      },
    });

    const retired = await prisma.invitationTemplateVersion.updateMany({
      where: { templateId: t.id, id: { not: version.id }, status: { not: "retired" } },
      data: { status: "retired" },
    });

    const moved = await prisma.invitationCampaign.updateMany({
      where: {
        templateVersion: { templateId: t.id },
        templateVersionId: { not: version.id },
        status: { in: NOT_SENT },
      },
      data: { templateVersionId: version.id },
    });

    console.log(
      `"${t.name}": v${version.versionNumber} stored and approved; ${retired.count} older version(s) retired; ${moved.count} unsent campaign(s) moved to it.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
