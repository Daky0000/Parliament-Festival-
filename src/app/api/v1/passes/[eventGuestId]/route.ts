import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { notFound } from "@/lib/http";
import { activePassToken, scanUrl } from "@/lib/guest-tokens";
import { passQrSvg } from "@/lib/pass-qr";
import { logAuditEvent } from "@/lib/audit";

// Downloads one guest's pass QR as SVG (print-quality, logo in the centre).
// A pass admits its holder, so this is limited to staff who manage guests,
// and every download is audited.
export const GET = withActor<{ eventGuestId: string }>(async (_request, { actor, params }) => {
  const guest = await prisma.eventGuest.findUnique({ where: { id: params.eventGuestId }, include: { person: true } });
  if (!guest) throw notFound();
  const event = await authorizeEvent(actor, "guests.update", guest.eventId);
  const token = await activePassToken(prisma, guest.id);
  if (!token) throw notFound();
  await logAuditEvent({
    organizationId: event.organizationId, eventId: event.id, actorUserId: actor.userId,
    action: "pass.downloaded", entityType: "event_guest", entityId: guest.id,
  });
  const svg = passQrSvg(scanUrl(token), { title: `Event pass for ${guest.person.fullName}` });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="pass-${guest.guestReference ?? guest.id}.svg"`,
      "Cache-Control": "no-store",
    },
  });
});
