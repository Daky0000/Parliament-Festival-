import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { generateSecureToken, generateReferenceCode } from "@/lib/tokens";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const query = searchParams.get("q")?.toLowerCase();
  const categoryKey = searchParams.get("category");
  const rsvpStatus = searchParams.get("rsvp");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const guests = await prisma.eventGuest.findMany({
    where: {
      eventId,
      ...(categoryKey && categoryKey !== "all" ? { protocolCategory: { categoryKey } } : {}),
      ...(query
        ? {
            OR: [
              { person: { fullName: { contains: query, mode: "insensitive" } } },
              { person: { email: { contains: query, mode: "insensitive" } } },
              { person: { phone: { contains: query, mode: "insensitive" } } },
              { institution: { name: { contains: query, mode: "insensitive" } } },
              { guestReference: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      person: true,
      protocolCategory: true,
      institution: true,
      invitations: {
        include: {
          rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
          invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
          emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
        },
      },
      seatAssignments: {
        where: { status: { in: ["proposed", "approved"] } },
        include: { section: true, seat: true },
      },
      attendanceRecords: {
        where: { checkinStatus: "checked_in" },
        take: 1,
      },
    },
    orderBy: [
      { protocolCategory: { rankOrder: "asc" } },
      { person: { fullName: "asc" } },
    ],
  });

  // Optional RSVP filter in-memory
  const filtered = rsvpStatus && rsvpStatus !== "all"
    ? guests.filter((g) => {
        const latestRsvp = g.invitations[0]?.rsvps[0]?.response || "pending";
        return latestRsvp === rsvpStatus;
      })
    : guests;

  return NextResponse.json({ data: filtered });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  const body = await request.json();

  const {
    eventId,
    title,
    fullName,
    email,
    phone,
    designation,
    company,
    institutionName,
    protocolCategoryId,
    companionAllowance,
    sectionId,
    seatCode,
    operationalNotes,
  } = body;

  const resolvedInstitutionName = (company || institutionName || "").trim();

  if (!eventId || !fullName) {
    return NextResponse.json({ error: "eventId and fullName are required" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { templates: { include: { versions: { where: { status: "approved" }, take: 1 } } } },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // 1. Resolve institution
  let institution = null;
  if (resolvedInstitutionName) {
    institution = await prisma.institution.findFirst({
      where: { name: resolvedInstitutionName },
    });
    if (!institution) {
      institution = await prisma.institution.create({
        data: {
          organizationId: event.organizationId,
          name: resolvedInstitutionName,
          institutionType: "State / Invited Organization",
        },
      });
    }
  }

  // 2. Check for duplicate person candidate or create
  let person = email
    ? await prisma.person.findFirst({
        where: { email: email.toLowerCase().trim() },
      })
    : null;

  if (person) {
    // Update phone/designation/institution if provided
    person = await prisma.person.update({
      where: { id: person.id },
      data: {
        title: title || person.title,
        designation: designation || person.designation,
        phone: phone || person.phone,
        institutionId: institution?.id || person.institutionId,
      },
    });
  } else {
    person = await prisma.person.create({
      data: {
        organizationId: event.organizationId,
        title: title?.trim() || null,
        fullName: fullName.trim(),
        designation: designation?.trim() || null,
        email: email ? email.toLowerCase().trim() : null,
        phone: phone?.trim() || null,
        institutionId: institution?.id || null,
      },
    });
  }

  // 3. Create EventGuest
  const guestReference = generateReferenceCode("GH-GST");
  const eventGuest = await prisma.eventGuest.create({
    data: {
      eventId,
      personId: person.id,
      institutionId: institution?.id || null,
      protocolCategoryId: protocolCategoryId || null,
      companionAllowance: companionAllowance !== undefined ? parseInt(companionAllowance, 10) : 1,
      guestReference,
      operationalNotes: operationalNotes || null,
      guestStatus: "active",
      createdBy: user?.userId,
    },
  });

  // 4. Handle Seating Assignment if seatCode or sectionId provided
  const seatingPlan = await prisma.seatingPlan.findFirst({
    where: { eventId },
    orderBy: { versionNumber: "desc" },
    include: { sections: true },
  });

  if (seatingPlan) {
    let targetSectionId = sectionId;

    // Auto-match section by protocolCategoryId if sectionId not explicitly selected
    if (!targetSectionId && protocolCategoryId) {
      const matchingSection = seatingPlan.sections.find(
        (s) => s.protocolCategoryId === protocolCategoryId
      );
      if (matchingSection) {
        targetSectionId = matchingSection.id;
      }
    }

    if (!targetSectionId && seatingPlan.sections.length > 0) {
      targetSectionId = seatingPlan.sections[0].id;
    }

    if (targetSectionId) {
      let seatId = null;

      if (seatCode && seatCode.trim()) {
        const cleanCode = seatCode.trim().toUpperCase();
        let existingSeat = await prisma.seat.findFirst({
          where: { sectionId: targetSectionId, seatCode: cleanCode },
        });

        if (!existingSeat) {
          existingSeat = await prisma.seat.create({
            data: {
              sectionId: targetSectionId,
              seatCode: cleanCode,
              seatStatus: "reserved",
            },
          });
        } else {
          await prisma.seat.update({
            where: { id: existingSeat.id },
            data: { seatStatus: "reserved" },
          });
        }
        seatId = existingSeat.id;
      }

      await prisma.seatAssignment.create({
        data: {
          seatingPlanId: seatingPlan.id,
          eventGuestId: eventGuest.id,
          sectionId: targetSectionId,
          seatId: seatId,
          assignmentType: "principal",
          status: "proposed",
          assignedBy: user?.userId,
        },
      });
    }
  }

  // 5. Auto-generate Official Invitation record so pass, token, reference code are ready
  const templateVersion =
    event.templates[0]?.versions[0] ||
    (await prisma.invitationTemplateVersion.findFirst({
      where: { template: { eventId } },
      orderBy: { createdAt: "desc" },
    }));

  if (templateVersion) {
    const { rawToken, tokenHash } = generateSecureToken();
    const invitationReference = generateReferenceCode("GH-INV");

    await prisma.invitation.create({
      data: {
        eventId,
        eventGuestId: eventGuest.id,
        templateVersionId: templateVersion.id,
        invitationReference,
        tokenHash,
        recipientEmailSnapshot: email || `${guestReference.toLowerCase()}@recipient.parliament.gh`,
        recipientNameSnapshot: `${title ? title + " " : ""}${fullName}`,
        designationSnapshot: designation || null,
        institutionSnapshot: resolvedInstitutionName || null,
        categorySnapshot: JSON.stringify({ protocolCategoryId }),
        invitationStatus: "prepared",
      },
    });
  }

  // 6. Fetch complete created guest with all relations
  const fullGuest = await prisma.eventGuest.findUnique({
    where: { id: eventGuest.id },
    include: {
      person: true,
      protocolCategory: true,
      institution: true,
      invitations: {
        include: {
          rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
          emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
        },
      },
      seatAssignments: {
        where: { status: { in: ["proposed", "approved"] } },
        include: { section: true, seat: true },
      },
    },
  });

  // Audit log
  if (user) {
    await logAuditEvent({
      organizationId: event.organizationId,
      eventId,
      actorUserId: user.userId,
      action: "GUEST_CREATED",
      entityType: "event_guest",
      entityId: eventGuest.id,
      afterData: { fullName, email, phone, company: resolvedInstitutionName, guestReference },
    });
  }

  return NextResponse.json({ data: fullGuest }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  const body = await request.json();
  const { eventGuestId, protocolCategoryId, seatCode, sectionId } = body;

  if (!eventGuestId) {
    return NextResponse.json({ error: "eventGuestId is required" }, { status: 400 });
  }

  const guest = await prisma.eventGuest.findUnique({
    where: { id: eventGuestId },
    include: { event: true },
  });
  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  // Update rank/category
  if (protocolCategoryId !== undefined) {
    await prisma.eventGuest.update({
      where: { id: eventGuestId },
      data: {
        protocolCategoryId: protocolCategoryId || null,
        categoryUpdatedBy: user?.userId,
        categoryUpdatedAt: new Date(),
      },
    });
  }

  // Update seating if requested
  if (sectionId) {
    const seatingPlan = await prisma.seatingPlan.findFirst({
      where: { eventId: guest.eventId },
      orderBy: { versionNumber: "desc" },
    });

    if (seatingPlan) {
      let seatId = null;
      if (seatCode && seatCode.trim()) {
        const cleanCode = seatCode.trim().toUpperCase();
        let existingSeat = await prisma.seat.findFirst({
          where: { sectionId, seatCode: cleanCode },
        });
        if (!existingSeat) {
          existingSeat = await prisma.seat.create({
            data: { sectionId, seatCode: cleanCode, seatStatus: "reserved" },
          });
        }
        seatId = existingSeat.id;
      }

      // Check existing assignment
      const existingAssignment = await prisma.seatAssignment.findFirst({
        where: { eventGuestId, seatingPlanId: seatingPlan.id },
      });

      if (existingAssignment) {
        await prisma.seatAssignment.update({
          where: { id: existingAssignment.id },
          data: { sectionId, seatId, status: "proposed" },
        });
      } else {
        await prisma.seatAssignment.create({
          data: {
            seatingPlanId: seatingPlan.id,
            eventGuestId,
            sectionId,
            seatId,
            status: "proposed",
            assignedBy: user?.userId,
          },
        });
      }
    }
  }

  const updatedGuest = await prisma.eventGuest.findUnique({
    where: { id: eventGuestId },
    include: {
      person: true,
      protocolCategory: true,
      institution: true,
      invitations: {
        include: {
          rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
          emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
          invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
        },
      },
      seatAssignments: {
        where: { status: { in: ["proposed", "approved"] } },
        include: { section: true, seat: true },
      },
    },
  });

  return NextResponse.json({ data: updatedGuest });
}
