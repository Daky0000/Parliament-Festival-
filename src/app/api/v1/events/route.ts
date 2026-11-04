import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";

export async function GET() {
  const events = await prisma.event.findMany({
    include: {
      categories: { orderBy: { rankOrder: "asc" } },
      _count: {
        select: {
          guests: true,
          invitations: true,
          seatingPlans: true,
          attendanceRecords: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: events });
}

