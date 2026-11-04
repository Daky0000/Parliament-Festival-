import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
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

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
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

    if (qrCredential.status !== "active") {
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
          { person: { fullName: { contains: manualQuery } } },
          { guestReference: { contains: manualQuery } },
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

  if (!targetGuest) {
    return NextResponse.json({ error: "Attendee record not found." }, { status: 404 });
  }

  // 4. Check for duplicate active check-in
  const existingCheckin = await prisma.attendanceRecord.findFirst({
    where: {
      eventId,
      eventGuestId: targetGuest.id,
      checkinStatus: "checked_in",
    },
    include: { recorder: true },
  });

  if (existingCheckin && !isSupervisorOverride) {
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
  const method = isSupervisorOverride
    ? "supervisor_override"
    : (checkinMethod as "qr" | "manual");

  const attendance = await prisma.attendanceRecord.create({
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
}
