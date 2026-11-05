import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { can, type Actor } from "./authz";
import { sha256Hex } from "./crypto";

// Event check-in. A QR scan is a request to verify an invitation, never proof
// of attendance: verifyScan() is read-only; only confirmCheckin() records
// attendance, inside one transaction, protected by the partial unique index
// uq_one_active_checkin_per_guest (exactly one concurrent confirm wins).

export type ScanState =
  | "VALID"
  | "ALREADY_CHECKED_IN"
  | "INVALID"
  | "EXPIRED"
  | "REVOKED"
  | "RSVP_DECLINED"
  | "EVENT_NOT_ACTIVE"
  | "WRONG_GATE"
  | "UNAUTHORIZED";

export type GuestCard = {
  eventGuestId: string;
  displayName: string;
  title: string | null;
  designation: string | null;
  institution: string | null;
  category: { name: string; colour: string | null } | null;
  seat: string | null;
  companionsExpected: number;
  reference: string;
  rsvp: "accepted" | "declined" | "pending";
};

export type ScanResult = {
  state: ScanState;
  message: string;
  event?: { id: string; name: string };
  gate?: { id: string; name: string; fastTrackEnabled: boolean } | null;
  guest?: GuestCard;
  existing?: { checkedInAt: Date; gateName: string | null; byName: string | null } | null;
  credentialId?: string;
};

const MESSAGES: Record<ScanState, string> = {
  VALID: "Invited guest. Confirm attendance when the guest is present.",
  ALREADY_CHECKED_IN: "Already checked in. Do not admit again; refer to a supervisor if this looks wrong.",
  INVALID: "This pass is not recognised. Refer to a supervisor.",
  EXPIRED: "This pass has expired. Refer to a supervisor.",
  REVOKED: "This pass has been revoked. Refer to a supervisor.",
  RSVP_DECLINED: "The guest declined the invitation. Follow event policy; a supervisor may admit.",
  EVENT_NOT_ACTIVE: "Check-in is not open for this event.",
  WRONG_GATE: "You are not assigned to this gate.",
  UNAUTHORIZED: "You are not authorized to check guests in for this event.",
};

const result = (state: ScanState, extra: Partial<ScanResult> = {}): ScanResult => ({ state, message: MESSAGES[state], ...extra });

/** Gates an usher can pick (optional, for reports). Every active gate of the event. */
export async function gatesForActor(_actor: Actor, eventId: string) {
  return prisma.gate.findMany({ where: { eventId, isActive: true }, orderBy: { name: "asc" } });
}

// Gates never block verification or check-in: any usher of the event may
// verify a pass and confirm the guest wherever they stand. A gate, when the
// usher picked one that belongs to this event, is only recorded for reports.
async function checkGate(_actor: Actor, eventId: string, gateId: string | null | undefined) {
  if (!gateId) return { ok: true as const, gate: null };
  const gate = await prisma.gate.findFirst({ where: { id: gateId, eventId, isActive: true } });
  return { ok: true as const, gate: gate ?? null };
}

function windowOpen(event: { status: string; checkinOpensAt: Date | null; checkinClosesAt: Date | null }, now = new Date()) {
  if (event.status !== "active") return false;
  if (event.checkinOpensAt && now < event.checkinOpensAt) return false;
  if (event.checkinClosesAt && now > event.checkinClosesAt) return false;
  return true;
}

async function guestCard(eventGuestId: string): Promise<GuestCard> {
  const g = await prisma.eventGuest.findUniqueOrThrow({
    where: { id: eventGuestId },
    include: {
      person: true,
      institution: true,
      protocolCategory: true,
      seatAssignments: { where: { status: { in: ["proposed", "approved"] } }, include: { section: true, seat: true }, take: 1 },
      invitations: { include: { rsvps: { orderBy: { submittedAt: "desc" }, take: 1 } } },
    },
  });
  const latest = g.invitations.flatMap((i) => i.rsvps).sort((a, b) => +b.submittedAt - +a.submittedAt)[0];
  const seat = g.seatAssignments[0];
  // Usher-safe fields only: no email, phone, notes or accessibility details.
  return {
    eventGuestId: g.id,
    displayName: g.person.fullName,
    title: g.person.title,
    designation: g.person.designation,
    institution: g.institution?.name ?? null,
    category: g.protocolCategory ? { name: g.protocolCategory.name, colour: g.protocolCategory.colourHex } : null,
    seat: seat ? `${seat.section.name}${seat.seat ? ` · Seat ${seat.seat.seatCode}` : ""}` : null,
    companionsExpected: latest?.response === "accepted" ? latest.companionCount : 0,
    reference: g.guestReference ?? "",
    rsvp: latest?.response === "accepted" ? "accepted" : latest?.response === "declined" ? "declined" : "pending",
  };
}

async function latestResponse(eventGuestId: string): Promise<string | null> {
  const r = await prisma.rsvp.findFirst({ where: { invitation: { eventGuestId } }, orderBy: { submittedAt: "desc" } });
  return r?.response ?? null;
}

async function existingCheckin(eventId: string, eventGuestId: string) {
  const rec = await prisma.attendanceRecord.findFirst({
    where: { eventId, eventGuestId, checkinStatus: "checked_in" },
    include: { gate: true, recorder: { select: { fullName: true } } },
  });
  return rec ? { checkedInAt: rec.checkedInAt, gateName: rec.gate?.name ?? null, byName: rec.recorder?.fullName ?? null } : null;
}

/**
 * Resolves a scanned token for an authenticated usher. Read-only.
 * A credential from an event the usher cannot access reads as INVALID, so
 * the existence of other events is not revealed.
 */
export async function verifyScan(actor: Actor, rawToken: string, gateId?: string | null): Promise<ScanResult> {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 100) return result("INVALID");
  const cred = await prisma.qrCredential.findUnique({
    where: { credentialHash: await sha256Hex(rawToken) },
    include: { event: true, invitation: true },
  });
  if (!cred || cred.event.organizationId !== actor.organizationId) return result("INVALID");
  if (!can(actor, "checkin.scan", cred.eventId)) return result("INVALID");

  const event = { id: cred.event.id, name: cred.event.name };
  const gateCheck = await checkGate(actor, cred.eventId, gateId);
  if (!gateCheck.ok) return result("WRONG_GATE", { event });
  const gate = gateCheck.gate ? { id: gateCheck.gate.id, name: gateCheck.gate.name, fastTrackEnabled: gateCheck.gate.fastTrackEnabled } : null;
  const base = { event, gate, credentialId: cred.id };

  if (cred.status === "revoked") return result("REVOKED", base);
  if (cred.status === "expired" || (cred.expiresAt && cred.expiresAt < new Date())) return result("EXPIRED", base);
  if (cred.status !== "active") return result("INVALID");

  const guest = await guestCard(cred.invitation.eventGuestId);
  const existing = await existingCheckin(cred.eventId, guest.eventGuestId);
  if (existing) return result("ALREADY_CHECKED_IN", { ...base, guest, existing });
  if (!windowOpen(cred.event)) return result("EVENT_NOT_ACTIVE", { ...base, guest });
  if ((await latestResponse(guest.eventGuestId)) === "declined") return result("RSVP_DECLINED", { ...base, guest });
  return result("VALID", { ...base, guest });
}

export type ConfirmInput = {
  eventId: string;
  gateId?: string | null;
  token?: string;
  eventGuestId?: string;
  method: "qr" | "manual" | "fast_track";
  override?: { reason: string };
  userAgent?: string | null;
};

export type ConfirmResult =
  | { ok: true; state: "CHECKED_IN"; attendanceId: string; checkedInAt: Date; guest: GuestCard }
  | { ok: false; state: ScanState; message: string; guest?: GuestCard; existing?: ScanResult["existing"] };

/**
 * Records attendance. Re-validates everything server-side (never trusts the
 * earlier scan result), then inserts in one transaction with the audit row.
 * If another device won the race, returns ALREADY_CHECKED_IN with the
 * original record.
 */
export async function confirmCheckin(actor: Actor, input: ConfirmInput): Promise<ConfirmResult> {
  const event = await prisma.event.findUnique({ where: { id: input.eventId } });
  const fail = async (state: ScanState, extra: Partial<ConfirmResult> = {}, eventGuestId?: string): Promise<ConfirmResult> => {
    await prisma.checkinAttempt.create({
      data: {
        eventId: event?.id ?? null,
        gateId: input.gateId ?? null,
        actorUserId: actor.userId,
        eventGuestId: eventGuestId ?? null,
        result: state.toLowerCase(),
        method: input.override ? "supervisor_override" : input.method,
      },
    });
    return { ok: false, state, message: MESSAGES[state], ...extra } as ConfirmResult;
  };

  if (!event || event.organizationId !== actor.organizationId || !can(actor, "checkin.scan", event.id)) return fail("UNAUTHORIZED");
  const isOverride = !!input.override;
  if (isOverride && !can(actor, "checkin.manual_override", event.id)) return fail("UNAUTHORIZED");

  const gateCheck = await checkGate(actor, event.id, input.gateId);
  if (!gateCheck.ok) return fail("WRONG_GATE");

  // Resolve the guest from the credential (QR) or the manual lookup choice.
  let eventGuestId: string;
  let credentialId: string | null = null;
  if (input.token) {
    const cred = await prisma.qrCredential.findUnique({
      where: { credentialHash: await sha256Hex(input.token) },
      include: { invitation: true },
    });
    if (!cred || cred.eventId !== event.id) return fail("INVALID");
    eventGuestId = cred.invitation.eventGuestId;
    credentialId = cred.id;
    if (!isOverride) {
      if (cred.status === "revoked") return fail("REVOKED", {}, eventGuestId);
      if (cred.status !== "active" || (cred.expiresAt && cred.expiresAt < new Date())) return fail("EXPIRED", {}, eventGuestId);
    }
  } else if (input.eventGuestId) {
    const g = await prisma.eventGuest.findUnique({ where: { id: input.eventGuestId } });
    if (!g || g.eventId !== event.id) return fail("INVALID");
    eventGuestId = g.id;
  } else {
    return fail("INVALID");
  }

  const guest = await guestCard(eventGuestId);
  if (!isOverride) {
    if (!windowOpen(event)) return fail("EVENT_NOT_ACTIVE", { guest }, eventGuestId);
    if ((await latestResponse(eventGuestId)) === "declined") return fail("RSVP_DECLINED", { guest }, eventGuestId);
  }

  const method = isOverride ? "supervisor_override" : input.method;
  try {
    const rec = await prisma.$transaction(async (tx) => {
      const created = await tx.attendanceRecord.create({
        data: {
          eventId: event.id,
          eventGuestId,
          qrCredentialId: credentialId,
          gateId: gateCheck.gate?.id ?? null,
          checkinStatus: "checked_in",
          checkedInBy: actor.userId,
          checkinMethod: method,
          overrideReason: input.override?.reason ?? null,
          overrideBy: isOverride ? actor.userId : null,
          deviceReference: input.userAgent?.slice(0, 100) ?? null,
        },
      });
      await tx.checkinAttempt.create({
        data: { eventId: event.id, gateId: gateCheck.gate?.id ?? null, actorUserId: actor.userId, eventGuestId, result: "checked_in", method },
      });
      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId,
          eventId: event.id,
          actorUserId: actor.userId,
          action: isOverride ? "checkin.override" : "checkin.recorded",
          entityType: "attendance_record",
          entityId: created.id,
          reason: input.override?.reason ?? null,
          afterData: JSON.stringify({ eventGuestId, gateId: gateCheck.gate?.id ?? null, method }),
        },
      });
      return created;
    });
    return { ok: true, state: "CHECKED_IN", attendanceId: rec.id, checkedInAt: rec.checkedInAt, guest };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return fail("ALREADY_CHECKED_IN", { guest, existing: await existingCheckin(event.id, eventGuestId) }, eventGuestId);
    }
    throw err;
  }
}

/** Supervisor correction: reverses a check-in (history is kept, never deleted). */
export async function reverseCheckin(actor: Actor, attendanceId: string, reason: string) {
  const rec = await prisma.attendanceRecord.findUnique({ where: { id: attendanceId }, include: { event: true } });
  if (!rec || rec.event.organizationId !== actor.organizationId || !can(actor, "checkin.manual_override", rec.eventId)) return null;
  if (rec.checkinStatus !== "checked_in") return { ok: false as const, message: "This check-in is not active." };
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.update({
      where: { id: rec.id },
      data: { checkinStatus: "reversed", reversedAt: new Date(), reversedBy: actor.userId, reversalReason: reason },
    });
    await tx.auditLog.create({
      data: {
        organizationId: rec.event.organizationId,
        eventId: rec.eventId,
        actorUserId: actor.userId,
        action: "checkin.reversed",
        entityType: "attendance_record",
        entityId: rec.id,
        reason,
        beforeData: JSON.stringify({ checkinStatus: "checked_in" }),
        afterData: JSON.stringify({ checkinStatus: "reversed" }),
      },
    });
  });
  return { ok: true as const };
}

/** Manual fallback search: limited, usher-safe fields, scoped to one event. */
export async function lookupGuests(eventId: string, q: string) {
  const query = q.trim();
  if (query.length < 2) return [];
  // Exact references first (guest reference, invitation reference, seat
  // number), then partial name / organisation matches.
  const exact = await prisma.eventGuest.findMany({
    where: {
      eventId,
      guestStatus: "active",
      OR: [
        { guestReference: { equals: query, mode: "insensitive" } },
        { invitations: { some: { invitationReference: { equals: query, mode: "insensitive" } } } },
        { seatAssignments: { some: { status: { in: ["proposed", "approved"] }, seat: { seatCode: { equals: query, mode: "insensitive" } } } } },
      ],
    },
    take: 10,
    select: { id: true },
  });
  const partial = await prisma.eventGuest.findMany({
    where: {
      eventId,
      guestStatus: "active",
      id: { notIn: exact.map((g) => g.id) },
      OR: [
        { guestReference: { contains: query, mode: "insensitive" } },
        { invitations: { some: { invitationReference: { contains: query, mode: "insensitive" } } } },
        { seatAssignments: { some: { status: { in: ["proposed", "approved"] }, seat: { seatCode: { contains: query, mode: "insensitive" } } } } },
        { person: { fullName: { contains: query, mode: "insensitive" } } },
        { institution: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    take: 10 - exact.length,
    select: { id: true },
  });
  return Promise.all([...exact, ...partial].map((g) => guestCard(g.id)));
}

/** Read-only verification for a guest found by reference (no QR). */
export async function verifyGuest(actor: Actor, eventId: string, eventGuestId: string, gateId?: string | null): Promise<ScanResult> {
  const ev = await prisma.event.findUnique({ where: { id: eventId } });
  if (!ev || ev.organizationId !== actor.organizationId || !can(actor, "checkin.scan", ev.id)) return result("INVALID");
  const event = { id: ev.id, name: ev.name };
  const gateCheck = await checkGate(actor, ev.id, gateId);
  if (!gateCheck.ok) return result("WRONG_GATE", { event });
  const gate = gateCheck.gate ? { id: gateCheck.gate.id, name: gateCheck.gate.name, fastTrackEnabled: gateCheck.gate.fastTrackEnabled } : null;
  const g = await prisma.eventGuest.findUnique({ where: { id: eventGuestId } });
  if (!g || g.eventId !== ev.id) return result("INVALID", { event, gate });
  const guest = await guestCard(g.id);
  const existing = await existingCheckin(ev.id, g.id);
  if (existing) return result("ALREADY_CHECKED_IN", { event, gate, guest, existing });
  if (!windowOpen(ev)) return result("EVENT_NOT_ACTIVE", { event, gate, guest });
  if ((await latestResponse(g.id)) === "declined") return result("RSVP_DECLINED", { event, gate, guest });
  return result("VALID", { event, gate, guest });
}
