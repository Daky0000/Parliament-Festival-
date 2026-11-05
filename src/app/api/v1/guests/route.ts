import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent, can } from "@/lib/authz";
import { forbidden, notFound } from "@/lib/http";

/** A category or section supplied by the client must belong to this event. */
async function assertBelongsToEvent(eventId: string, ids: { protocolCategoryId?: string | null; sectionId?: string | null }) {
  if (ids.protocolCategoryId) {
    const cat = await prisma.protocolCategory.findUnique({ where: { id: ids.protocolCategoryId } });
    if (!cat || cat.eventId !== eventId) throw notFound();
  }
  if (ids.sectionId) {
    const sec = await prisma.seatingSection.findUnique({ where: { id: ids.sectionId }, include: { seatingPlan: true } });
    if (!sec || sec.seatingPlan.eventId !== eventId) throw notFound();
  }
}
import { logAuditEvent } from "@/lib/audit";
import { ensureGuestPass, issueInvitation, withUniqueReference } from "@/lib/guest-tokens";

export const GET = withActor(async (request, { actor }) => {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const query = searchParams.get("q")?.toLowerCase();
  const categoryKey = searchParams.get("category");
  const rsvpStatus = searchParams.get("rsvp");

  await authorizeEvent(actor, "guests.read", eventId);

  const guests = await prisma.eventGuest.findMany({
    where: {
      eventId: eventId!,
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
});

export const POST = withActor(async (request, { actor }) => {
  const user = actor;
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

  await authorizeEvent(actor, "guests.create", eventId);
  if (!fullName) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }
  if (sectionId && !can(actor, "seating.assign", eventId)) throw forbidden();
  await assertBelongsToEvent(eventId, { protocolCategoryId, sectionId });

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { templates: { include: { versions: { where: { status: "approved" }, take: 1 } } } },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // 1. Resolve institution
  let institution = null;
  if (resolvedInstitutionName) {
    institution = await prisma.institution.findFirst({
      where: { organizationId: event.organizationId, name: resolvedInstitutionName },
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
        where: { organizationId: event.organizationId, email: email.toLowerCase().trim() },
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
  const eventGuest = await withUniqueReference("GH-GST", (guestReference) => prisma.eventGuest.create({
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
  }));
  const guestReference = eventGuest.guestReference;

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
    await issueInvitation(prisma, {
        eventId,
        eventGuestId: eventGuest.id,
        templateVersionId: templateVersion.id,
        tokenExpiresAt: event.endsAt,
        recipientEmailSnapshot: email || `${(guestReference ?? eventGuest.id).toLowerCase()}@recipient.parliament.gh`,
        recipientNameSnapshot: `${title ? title + " " : ""}${fullName}`,
        designationSnapshot: designation || null,
        institutionSnapshot: resolvedInstitutionName || null,
        categorySnapshot: JSON.stringify({ protocolCategoryId }),
        invitationStatus: "prepared",
    });
  }

  // Seated guests get a working QR pass straight away.
  if (await prisma.seatAssignment.count({ where: { eventGuestId: eventGuest.id, status: { in: ["proposed", "approved"] } } })) {
    await ensureGuestPass(prisma, eventGuest.id);
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
      // No personal data in the audit trail.
      afterData: { guestId: eventGuest.id, protocolCategoryId: protocolCategoryId || null, hasEmail: !!email, guestReference },
    });
  }

  return NextResponse.json({ data: fullGuest }, { status: 201 });
});

export const PATCH = withActor(async (request, { actor }) => {
  const user = actor;
  const body = await request.json();
  const { eventGuestId, protocolCategoryId, seatCode, sectionId } = body;

  if (!eventGuestId) {
    return NextResponse.json({ error: "eventGuestId is required" }, { status: 400 });
  }

  const guest = await prisma.eventGuest.findUnique({
    where: { id: eventGuestId },
    include: { event: true },
  });
  if (!guest) throw notFound();
  // The event comes from the guest record, never from the client.
  await authorizeEvent(actor, "guests.update", guest.eventId);
  if (sectionId && !can(actor, "seating.assign", guest.eventId)) throw forbidden();
  await assertBelongsToEvent(guest.eventId, { protocolCategoryId, sectionId });

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

  if (sectionId) await ensureGuestPass(prisma, eventGuestId);

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
});
