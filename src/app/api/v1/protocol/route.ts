import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withActor, authorizeEvent } from "@/lib/authz";
import { notFound } from "@/lib/http";
import { logAuditEvent } from "@/lib/audit";

export const GET = withActor(async (request, { actor }) => {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  await authorizeEvent(actor, "protocol.read", eventId);

  const whereClause = { eventId: eventId! };

  const categories = await prisma.protocolCategory.findMany({
    where: whereClause,
    orderBy: { rankOrder: "asc" },
    include: {
      eventGuests: {
        where: { guestStatus: "active" },
        include: {
          person: true,
          institution: true,
          invitations: {
            include: {
              rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
              emailAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
              invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
            },
            take: 1,
          },
          seatAssignments: {
            where: { status: { in: ["proposed", "approved"] } },
            include: { section: true, seat: true },
          },
        },
      },
      seatingSections: true,
    },
  });

  const categoriesWithStats = categories.map((cat) => {
    let confirmedCount = 0;
    let declinedCount = 0;
    let pendingCount = 0;
    let emailsSentCount = 0;
    let emailsOpenedCount = 0;
    let repliedCount = 0;
    let seatedCount = 0;

    for (const g of cat.eventGuests) {
      const inv = g.invitations[0];
      const latestRsvp = inv?.rsvps[0];

      if (latestRsvp?.response === "accepted") {
        confirmedCount++;
        repliedCount++;
      } else if (latestRsvp?.response === "declined") {
        declinedCount++;
        repliedCount++;
      } else {
        pendingCount++;
      }

      if (inv?.invitationStatus === "sent" || (inv?.emailAttempts && inv.emailAttempts.length > 0)) {
        emailsSentCount++;
      }

      const hasOpened = inv?.invitationEvents?.some(
        (e) => e.eventType === "open_signal" || e.eventType === "link_access"
      );
      if (hasOpened) {
        emailsOpenedCount++;
      }

      if (g.seatAssignments && g.seatAssignments.length > 0) {
        seatedCount++;
      }
    }

    return {
      ...cat,
      stats: {
        totalGuests: cat.eventGuests.length,
        confirmedCount,
        declinedCount,
        pendingCount,
        emailsSentCount,
        emailsOpenedCount,
        repliedCount,
        seatedCount,
      },
    };
  });

  return NextResponse.json({ data: categoriesWithStats });
});

export const POST = withActor(async (request, { actor }) => {
  const user = actor;
  const body = await request.json();

  const { eventId, name, rankOrder, colourHex, description, categoryKey } = body;
  await authorizeEvent(actor, "protocol.configure", eventId);

  if (!name) {
    return NextResponse.json({ error: "Rank name is required" }, { status: 400 });
  }

  // 1. Slugify categoryKey if not provided
  let generatedKey = categoryKey;
  if (!generatedKey) {
    generatedKey = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  }

  // Check key uniqueness
  let finalKey = generatedKey;
  const existingKey = await prisma.protocolCategory.findUnique({
    where: { eventId_categoryKey: { eventId, categoryKey: finalKey } },
  });
  if (existingKey) {
    finalKey = `${generatedKey}_${Date.now().toString().slice(-4)}`;
  }

  // 2. Resolve rankOrder
  let finalRankOrder = parseInt(rankOrder, 10);
  if (isNaN(finalRankOrder) || finalRankOrder <= 0) {
    const highestRank = await prisma.protocolCategory.findFirst({
      where: { eventId },
      orderBy: { rankOrder: "desc" },
    });
    finalRankOrder = (highestRank?.rankOrder || 0) + 1;
  } else {
    // If rank order already exists, shift subsequent categories down
    const conflict = await prisma.protocolCategory.findUnique({
      where: { eventId_rankOrder: { eventId, rankOrder: finalRankOrder } },
    });
    if (conflict) {
      // Find all ranks >= finalRankOrder in descending order to avoid unique constraint collision
      const toShift = await prisma.protocolCategory.findMany({
        where: { eventId, rankOrder: { gte: finalRankOrder } },
        orderBy: { rankOrder: "desc" },
      });
      for (const item of toShift) {
        await prisma.protocolCategory.update({
          where: { id: item.id },
          data: { rankOrder: item.rankOrder + 1 },
        });
      }
    }
  }

  // 3. Create ProtocolCategory
  const newCategory = await prisma.protocolCategory.create({
    data: {
      eventId,
      categoryKey: finalKey,
      name: name.trim(),
      rankOrder: finalRankOrder,
      colourHex: colourHex || "#2563EB",
      description: description || null,
      eligibilityRules: JSON.stringify({ priority: finalRankOrder }),
    },
  });

  // 4. Optionally create a default seating section for this new rank if a seating plan exists
  const seatingPlan = await prisma.seatingPlan.findFirst({
    where: { eventId },
    orderBy: { versionNumber: "desc" },
  });
  if (seatingPlan) {
    const sectionCode = `SEC-R${finalRankOrder}-${finalKey.toUpperCase().slice(0, 6)}`;
    const section = await prisma.seatingSection.create({
      data: {
        seatingPlanId: seatingPlan.id,
        sectionCode,
        name: `Section Rank ${finalRankOrder} (${name.slice(0, 25)})`,
        protocolCategoryId: newCategory.id,
        capacity: 30,
        displayOrder: finalRankOrder,
        colourHex: colourHex || "#2563EB",
        sectionType: finalRankOrder <= 2 ? "vip" : "general",
      },
    });

    // Create 10 default seats in this section
    for (let s = 1; s <= 10; s++) {
      await prisma.seat.create({
        data: {
          sectionId: section.id,
          seatCode: `${sectionCode}-R1-S${s}`,
          rowLabel: "Row 1",
          seatNumber: s,
          seatStatus: "available",
        },
      });
    }
  }

  if (user) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (event) {
      await logAuditEvent({
        organizationId: event.organizationId,
        eventId,
        actorUserId: user.userId,
        action: "PROTOCOL_RANK_CREATED",
        entityType: "protocol_category",
        entityId: newCategory.id,
        afterData: { name: newCategory.name, rankOrder: newCategory.rankOrder },
      });
    }
  }

  return NextResponse.json({ data: newCategory }, { status: 201 });
});

export const PATCH = withActor(async (request, { actor }) => {
  const user = actor;
  const body = await request.json();
  const { action, categoryId, guestIds, name, rankOrder, colourHex, description } = body;

  // The event comes from the category record, never from the client.
  if (typeof categoryId !== "string") {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }
  const target = await prisma.protocolCategory.findUnique({ where: { id: categoryId } });
  if (!target) throw notFound();
  const eventId = target.eventId;
  await authorizeEvent(actor, "protocol.configure", eventId);

  // Action: Assign Dignitaries to a Rank
  if (action === "assign_guests") {
    if (!categoryId || !Array.isArray(guestIds) || guestIds.length === 0) {
      return NextResponse.json(
        { error: "categoryId and an array of guestIds are required" },
        { status: 400 }
      );
    }

    const category = await prisma.protocolCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      return NextResponse.json({ error: "Protocol Category not found" }, { status: 404 });
    }

    // Update guests to this category
    const updatedGuests = await prisma.eventGuest.updateMany({
      where: { id: { in: guestIds }, eventId },
      data: {
        protocolCategoryId: category.id,
        categoryUpdatedBy: user?.userId,
        categoryUpdatedAt: new Date(),
      },
    });

    if (user && eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (event) {
        await logAuditEvent({
          organizationId: event.organizationId,
          eventId,
          actorUserId: user.userId,
          action: "GUESTS_ASSIGNED_TO_RANK",
          entityType: "protocol_category",
          entityId: category.id,
          afterData: { guestCount: updatedGuests.count, targetRank: category.rankOrder },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Assigned ${updatedGuests.count} dignitary(ies) to Rank ${category.rankOrder}`,
    });
  }

  // Action: Update Rank Details
  if (action === "update_rank" || categoryId) {
    const existing = await prisma.protocolCategory.findUnique({
      where: { id: categoryId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Rank category not found" }, { status: 404 });
    }

    const updated = await prisma.protocolCategory.update({
      where: { id: categoryId },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(rankOrder ? { rankOrder: parseInt(rankOrder, 10) } : {}),
        ...(colourHex ? { colourHex } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });

    return NextResponse.json({ data: updated });
  }

  return NextResponse.json({ error: "Invalid action or parameters" }, { status: 400 });
});
