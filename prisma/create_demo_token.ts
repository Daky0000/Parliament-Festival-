import { prisma } from "../src/lib/db";
import { hashToken } from "../src/lib/tokens";
import { assertSeedAllowed } from "./seed-guard";

assertSeedAllowed("create_demo_token");

async function main() {
  const event = await prisma.event.findFirst({ where: { eventCode: "CAROLS-2026" } });
  const guest = await prisma.eventGuest.findFirst({
    where: { person: { fullName: { contains: "Bagbin" } } },
    include: { person: true, protocolCategory: true, institution: true },
  });
  const templateVersion = await prisma.invitationTemplateVersion.findFirst();

  if (event && guest && templateVersion) {
    const rawToken = "demo-vip-token";
    const tokenHash = hashToken(rawToken);

    await prisma.invitation.upsert({
      where: { tokenHash },
      update: {},
      create: {
        eventId: event.id,
        eventGuestId: guest.id,
        templateVersionId: templateVersion.id,
        invitationReference: "INV-GH-SPEAKER-01",
        tokenHash,
        recipientEmailSnapshot: guest.person.email || "speaker@parliament.gh",
        recipientNameSnapshot: guest.person.fullName,
        designationSnapshot: guest.person.designation,
        institutionSnapshot: guest.institution?.name,
        categorySnapshot: JSON.stringify(guest.protocolCategory || {}),
        invitationStatus: "sent",
      },
    });
    console.log("Demo token created: demo-vip-token");
  }
}

main().finally(() => prisma.$disconnect());

