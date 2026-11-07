import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { INVITATION_HTML, INVITATION_SUBJECT, INVITATION_TEXT, INVITATION_TEMPLATE_VERSION_NOTE } from "./email/invitation-template";

export const DEFAULT_TEMPLATE_NAME = "Official State Invitation";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Gives an event the official invitation email (src/lib/email/invitation-template.ts)
 * as an approved template version, unless it already has an approved email
 * version. The design is the platform's reviewed default, so it is approved
 * on creation; later edits go through the normal versioning.
 * Returns the approved version id, and whether one was created.
 */
export async function ensureDefaultInvitationTemplate(
  db: Db,
  eventId: string,
  actorUserId: string | null,
  approvalNote = `Platform default design. ${INVITATION_TEMPLATE_VERSION_NOTE}`
): Promise<{ versionId: string; created: boolean }> {
  const existing = await db.invitationTemplateVersion.findFirst({
    where: { status: "approved", template: { eventId, channel: "email" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return { versionId: existing.id, created: false };

  const template = await db.invitationTemplate.create({
    data: { eventId, name: DEFAULT_TEMPLATE_NAME, channel: "email", status: "active", createdBy: actorUserId },
  });
  const version = await db.invitationTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: 1,
      subjectTemplate: INVITATION_SUBJECT,
      htmlContent: INVITATION_HTML,
      textContent: INVITATION_TEXT,
      status: "approved",
      createdBy: actorUserId,
      approvedBy: actorUserId,
      approvedAt: new Date(),
      approvalNote,
      contentSha256: crypto.createHash("sha256").update(INVITATION_HTML).digest("hex"),
    },
  });
  return { versionId: version.id, created: true };
}
