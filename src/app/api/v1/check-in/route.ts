import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent, can } from "@/lib/authz";
import { HttpError, forbidden } from "@/lib/http";

// Interim (Phase 1) check-in: authorized, event-scoped, one check-in per
// guest enforced by the database. Phase 4 replaces this with the scan ->
// verify -> confirm flow and gate assignments.
export const POST = withActor(async (request, { actor }) => {
  const user = actor;
  const body = await request.json();
  const {
    eventId,
    credentialHash,
    manualQuery,
    eventGuestId,
    checkinMethod = "qr",
    isSupervisorOverride = false,
    overrideReason,
  } = body;

  const event = await authorizeEvent(actor, "checkin.scan", eventId);
  if (isSupervisorOverride) {
    if (!can(actor, "checkin.manual_override", eventId)) throw forbidden();
    if (typeof overrideReason !== "string" || overrideReason.trim().length < 5) {
      throw new HttpError(400, "An override needs a reason.");
    }
  }

  let targetGuest = null;
  let qrCredential = null;

  // 1. Resolve by QR Credential Hash
  if (credentialHash) {
    qrCredential = await prisma.qrCredential.findUnique({
      where: { credentialHash },
      include: {
        invitation: {
          include: {
            eventGuest: {
              include: {
                person: true,
                protocolCategory: true,
                seatAssignments: {
                  where: { status: { in: ["proposed", "approved"] } },
                  include: { section: true, seat: true },
                  take: 1,
                },
                invitations: {
                  include: {
                    rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!qrCredential || qrCredential.eventId !== eventId) {
      return NextResponse.json(
        { error: "Invalid credential for this parliamentary event." },
        { status: 404 }
      );
    }

    if (qrCredential.status !== "active" || (qrCredential.expiresAt && qrCredential.expiresAt < new Date())) {
      return NextResponse.json(
        { error: `This credential has been ${qrCredential.status}. Access denied.` },
        { status: 403 }
      );
    }

    targetGuest = qrCredential.invitation.eventGuest;
  }

  // 2. Resolve by Guest ID (e.g. from manual search selection)
  else if (eventGuestId) {
    targetGuest = await prisma.eventGuest.findUnique({
      where: { id: eventGuestId },
      include: {
        person: true,
        protocolCategory: true,
        seatAssignments: {
          where: { status: { in: ["proposed", "approved"] } },
          include: { section: true, seat: true },
          take: 1,
        },
        invitations: {
          include: {
            rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
          },
        },
      },
    });
  }

  // 3. Manual Search Fallback
  else if (manualQuery) {
    const candidates = await prisma.eventGuest.findMany({
      where: {
        eventId,
        OR: [
          { person: { fullName: { contains: manualQuery, mode: "insensitive" } } },
          { guestReference: { contains: manualQuery, mode: "insensitive" } },
        ],
      },
      include: {
        person: true,
        protocolCategory: true,
        seatAssignments: {
          where: { status: { in: ["proposed", "approved"] } },
          include: { section: true, seat: true },
        },
      },
      take: 10,
    });

    return NextResponse.json({
      data: {
        type: "search_results",
        results: candidates.map((c) => ({
          guestId: c.id,
          fullName: c.person.fullName,
          title: c.person.title,
          guestReference: c.guestReference,
          categoryName: c.protocolCategory?.name,
          categoryColor: c.protocolCategory?.colourHex,
          seatLabel: c.seatAssignments[0]
            ? `${c.seatAssignments[0].section.name} (Seat ${c.seatAssignments[0].seat?.seatCode || "General"})`
            : "No seat assigned",
        })),
      },
    });
  }

  if (!targetGuest || targetGuest.eventId !== eventId) {
    return NextResponse.json({ error: "Attendee record not found." }, { status: 404 });
  }

  const latestResponse = targetGuest.invitations
    .flatMap((i) => i.rsvps)
    .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0]?.response;
  if (latestResponse === "declined" && !isSupervisorOverride) {
    return NextResponse.json(
      { status: "RSVP_DECLINED", message: "This guest declined the invitation. Refer to a supervisor." },
      { status: 409 }
    );
  }

  // 4. Check for duplicate active check-in
  const existingCheckin = await prisma.attendanceRecord.findFirst({
    where: {
      eventId,
      eventGuestId: targetGuest.id,
      checkinStatus: "checked_in",
    },
    include: { recorder: { select: { fullName: true } } },
  });

  if (existingCheckin) {
    return NextResponse.json(
      {
        status: "DUPLICATE_CHECKIN_WARNING",
        message: "This guest has already checked in!",
        details: {
          checkedInAt: existingCheckin.checkedInAt,
          checkedInBy: existingCheckin.recorder?.fullName || "Another Usher",
          method: existingCheckin.checkinMethod,
          guestName: targetGuest.person.fullName,
        },
      },
      { status: 409 }
    );
  }

  // 5. Record Check-In
  const method = isSupervisorOverride ? "supervisor_override" : checkinMethod === "manual" ? "manual" : "qr";

  let attendance;
  try {
    attendance = await prisma.$transaction(async (tx) => {
      const rec = await tx.attendanceRecord.create({
    data: {
      eventId,
      eventGuestId: targetGuest.id,
      qrCredentialId: qrCredential?.id || null,
      checkinStatus: "checked_in",
      checkedInBy: user?.userId,
      checkinMethod: method,
      overrideReason: isSupervisorOverride ? overrideReason : null,
      deviceReference: request.headers.get("user-agent")?.slice(0, 100) || "Usher Device",
    },
  });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorUserId: actor.userId,
          action: isSupervisorOverride ? "CHECKIN_OVERRIDE" : "CHECKIN_RECORDED",
          entityType: "attendance_record",
          entityId: rec.id,
          reason: isSupervisorOverride ? overrideReason : null,
          afterData: JSON.stringify({ guestId: targetGuest.id, method }),
        },
      });
      return rec;
    });
  } catch (err) {
    // Another device checked this guest in first (partial unique index).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { status: "DUPLICATE_CHECKIN_WARNING", message: "This guest has already checked in!" },
        { status: 409 }
      );
    }
    throw err;
  }

  const latestRsvp = targetGuest.invitations[0]?.rsvps[0];
  const activeSeat = targetGuest.seatAssignments[0];

  return NextResponse.json({
    data: {
      status: "CHECKED_IN",
      attendanceId: attendance.id,
      checkedInAt: attendance.checkedInAt,
      guest: {
        title: targetGuest.person.title,
        fullName: targetGuest.person.fullName,
        designation: targetGuest.person.designation,
        categoryName: targetGuest.protocolCategory?.name || "General Guest",
        categoryColor: targetGuest.protocolCategory?.colourHex || "#102343",
        companionCount: latestRsvp?.companionCount || 0,
        sectionName: activeSeat?.section.name || "Main Forecourt",
        sectionColor: activeSeat?.section.colourHex || "#102343",
        seatCode: activeSeat?.seat?.seatCode || "Open Seating Section",
      },
    },
  });
});
