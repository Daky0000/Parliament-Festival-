import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

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
      ...(categoryKey ? { protocolCategory: { categoryKey } } : {}),
      ...(query
        ? {
            OR: [
              { person: { fullName: { contains: query } } },
              { person: { email: { contains: query } } },
              { institution: { name: { contains: query } } },
              { guestReference: { contains: query } },
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
          invitationEvents: { orderBy: { occurredAt: "desc" }, take: 3 },
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
  const filtered = rsvpStatus
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
    institutionName,
    protocolCategoryId,
    companionAllowance,
  } = body;

  if (!eventId || !fullName) {
    return NextResponse.json({ error: "eventId and fullName are required" }, { status: 400 });
  }

  // 1. Check for duplicate person candidate
  let person = email
    ? await prisma.person.findFirst({
        where: { email: email.toLowerCase().trim() },
      })
    : null;

  // 2. Resolve institution
  let institution = null;
  if (institutionName) {
    institution = await prisma.institution.findFirst({
      where: { name: institutionName.trim() },
    });
    if (!institution) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (event) {
        institution = await prisma.institution.create({
          data: {
            organizationId: event.organizationId,
            name: institutionName.trim(),
          },
        });
      }
    }
  }

  // 3. Create person if not existing
  if (!person) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    person = await prisma.person.create({
      data: {
        organizationId: event.organizationId,
        title,
        fullName,
        designation,
        email: email ? email.toLowerCase().trim() : null,
        phone,
        institutionId: institution?.id,
      },
    });
  }

  // 4. Create EventGuest
  const guestReference = `GH-GST-${Math.floor(1000 + Math.random() * 9000)}`;
  const eventGuest = await prisma.eventGuest.create({
    data: {
      eventId,
      personId: person.id,
      institutionId: institution?.id,
      protocolCategoryId,
      companionAllowance: companionAllowance ?? 0,
      guestReference,
      guestStatus: "active",
      createdBy: user?.userId,
    },
    include: {
      person: true,
      protocolCategory: true,
      institution: true,
    },
  });

  // Audit log
  if (user) {
    await logAuditEvent({
      organizationId: user.organizationId,
      eventId,
      actorUserId: user.userId,
      action: "GUEST_CREATED",
      entityType: "event_guest",
      entityId: eventGuest.id,
      afterData: { fullName, email, guestReference },
    });
  }

  return NextResponse.json({ data: eventGuest }, { status: 201 });
}

