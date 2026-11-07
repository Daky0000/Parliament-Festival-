import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const SEATS_PER_ROW = 10;

/** SEC-A-R1-S01 style code for the n-th seat (1-based) of a section. */
export function seatCodeFor(sectionCode: string, n: number): { seatCode: string; rowLabel: string; seatNumber: number } {
  const row = Math.ceil(n / SEATS_PER_ROW);
  const seat = ((n - 1) % SEATS_PER_ROW) + 1;
  return { seatCode: `${sectionCode}-R${row}-S${String(seat).padStart(2, "0")}`, rowLabel: `Row ${row}`, seatNumber: n };
}

/**
 * Picks the next free seat in a section for a new guest, inside the caller's
 * transaction. The section row is locked first, so two admins adding guests
 * at the same moment never get the same seat (the partial unique index
 * uq_active_seat_assignment backs this up).
 *
 * Order: the section's own free seats (available or reserved, with no live assignment) by row
 * and number; if there are none and the section still has capacity, a new
 * seat is created with the next sequential code. Returns null when the
 * section is full; the caller then leaves the guest unseated.
 */
export async function allocateNextSeat(tx: Tx, opts: { seatingPlanId: string; sectionId: string }): Promise<{ id: string; seatCode: string } | null> {
  await tx.$queryRaw`SELECT id FROM "seating_sections" WHERE "id" = ${opts.sectionId} FOR UPDATE`;
  const section = await tx.seatingSection.findUniqueOrThrow({
    where: { id: opts.sectionId },
    include: { seats: { orderBy: [{ seatNumber: "asc" }, { seatCode: "asc" }] } },
  });

  const live = await tx.seatAssignment.findMany({
    where: { seatingPlanId: opts.seatingPlanId, sectionId: section.id, status: { in: ["proposed", "approved"] } },
    select: { seatId: true },
  });
  const taken = new Set(live.map((a) => a.seatId).filter(Boolean));

  const free = section.seats
    .filter((s) => (s.seatStatus === "available" || s.seatStatus === "reserved") && !taken.has(s.id))
    .sort((a, b) => (a.rowLabel ?? "").localeCompare(b.rowLabel ?? "", undefined, { numeric: true }) || (a.seatNumber ?? 0) - (b.seatNumber ?? 0));
  if (free[0]) {
    await tx.seat.update({ where: { id: free[0].id }, data: { seatStatus: "reserved" } });
    return { id: free[0].id, seatCode: free[0].seatCode };
  }

  if (section.capacity > 0 && live.length >= section.capacity) return null;

  const existingCodes = new Set(section.seats.map((s) => s.seatCode));
  let n = section.seats.length + 1;
  while (existingCodes.has(seatCodeFor(section.sectionCode, n).seatCode)) n++;
  const next = seatCodeFor(section.sectionCode, n);
  const seat = await tx.seat.create({
    data: { sectionId: section.id, seatCode: next.seatCode, rowLabel: next.rowLabel, seatNumber: next.seatNumber, seatStatus: "reserved" },
  });
  return { id: seat.id, seatCode: seat.seatCode };
}
