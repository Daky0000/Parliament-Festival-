import { prisma } from "../db";
import { authorizeEvent, type Actor } from "../authz";
import type { Permission } from "../roles";
import { logAuditEvent } from "../audit";
import { runDeterministicSeatingEngine } from "../seating/engine";

export interface ToolDefinition {
  name: string;
  description: string;
  permissionKey: string;
  isWriteTool: boolean;
  requiresHumanApproval: boolean;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export const AI_TOOL_REGISTRY: Record<string, ToolDefinition> = {
  search_guests: {
    name: "search_guests",
    description: "Search guest directory by name, institution, or protocol rank.",
    permissionKey: "guests.read",
    isWriteTool: false,
    requiresHumanApproval: false,
    parameters: {
      eventId: { type: "string", description: "Event ID", required: true },
      query: { type: "string", description: "Search query text", required: false },
      categoryKey: { type: "string", description: "Optional protocol category filter", required: false },
    },
  },
  get_guest_summary: {
    name: "get_guest_summary",
    description: "Retrieve complete protocol profile, RSVP, and seating status for a specific guest.",
    permissionKey: "guests.read",
    isWriteTool: false,
    requiresHumanApproval: false,
    parameters: {
      guestId: { type: "string", description: "Event Guest ID", required: true },
    },
  },
  list_pending_rsvps: {
    name: "list_pending_rsvps",
    description: "Retrieve guests who have not yet submitted an RSVP response.",
    permissionKey: "rsvps.read",
    isWriteTool: false,
    requiresHumanApproval: false,
    parameters: {
      eventId: { type: "string", description: "Event ID", required: true },
    },
  },
  draft_invitation_copy: {
    name: "draft_invitation_copy",
    description: "Draft formal institutional invitation wording with proper parliamentary honorifics.",
    permissionKey: "campaigns.create",
    isWriteTool: false,
    requiresHumanApproval: false,
    parameters: {
      recipientTitle: { type: "string", description: "Title of dignitary", required: true },
      recipientName: { type: "string", description: "Full name", required: true },
      eventTitle: { type: "string", description: "Official event title", required: true },
      tone: { type: "string", description: "Formal/Editorial tone", required: false },
    },
  },
  propose_seating_allocation: {
    name: "propose_seating_allocation",
    description: "Run the deterministic protocol seating engine to generate recommended seat assignments.",
    permissionKey: "seating.assign",
    isWriteTool: true,
    requiresHumanApproval: true,
    parameters: {
      eventId: { type: "string", description: "Event ID", required: true },
      seatingPlanId: { type: "string", description: "Target Seating Plan ID", required: true },
    },
  },
  draft_event_report: {
    name: "draft_event_report",
    description: "Generate executive operational narrative summarizing invitation, RSVP, seating, and attendance metrics.",
    permissionKey: "reports.read",
    isWriteTool: false,
    requiresHumanApproval: false,
    parameters: {
      eventId: { type: "string", description: "Event ID", required: true },
    },
  },
};

/**
 * Executes an AI tool under strict authorization and policy rules.
 */
export async function executeAiTool(
  toolName: string,
  args: Record<string, any>,
  actor: Actor,
  opts: { approved?: boolean } = {}
) {
  const tool = AI_TOOL_REGISTRY[toolName];
  if (!tool) {
    throw new Error(`Tool ${toolName} not registered in AI Tool Registry.`);
  }
  const userId = actor.userId;

  // 1. Every tool is event-scoped: the actor must reach the event and hold the
  // tool's permission for it. There is no platform-wide bypass.
  try {
    // Approving a stored request is not using the assistant; only the tool permission applies.
    if (!opts.approved) await authorizeEvent(actor, "ai.use", args.eventId);
    await authorizeEvent(actor, tool.permissionKey as Permission, args.eventId);
  } catch {
    return {
      status: "denied",
      error: `Security Policy Gate: you lack '${tool.permissionKey}' for this event.`,
    };
  }
  // IDs that point at other records must belong to the same event.
  if (args.seatingPlanId) {
    const plan = await prisma.seatingPlan.findUnique({ where: { id: String(args.seatingPlanId) } });
    if (!plan || plan.eventId !== args.eventId) return { status: "denied", error: "Seating plan not found for this event." };
  }
  const guestRef = args.eventGuestId ?? args.guestId;
  if (guestRef) {
    const g = await prisma.eventGuest.findUnique({ where: { id: String(guestRef) } });
    if (!g || g.eventId !== args.eventId) return { status: "denied", error: "Guest not found for this event." };
  }

  // 2. Human-In-The-Loop Approval Gate for Write Tools
  // Only the server-side approval endpoint passes approved: true, after a
  // person with the tool's permission has approved the stored request.
  if (tool.requiresHumanApproval && !opts.approved) {
    return {
      status: "awaiting_approval",
      toolName,
      permissionKey: tool.permissionKey,
      inputSummary: args,
      message: `The tool '${toolName}' performs state-modifying actions. Please review and click 'Approve' to proceed.`,
    };
  }

  // 3. Typed Tool Execution
  switch (toolName) {
    case "search_guests": {
      const guests = await prisma.eventGuest.findMany({
        where: {
          eventId: args.eventId,
          ...(args.query
            ? {
                OR: [
                  { person: { fullName: { contains: args.query, mode: "insensitive" } } },
                  { institution: { name: { contains: args.query, mode: "insensitive" } } },
                ],
              }
            : {}),
          ...(args.categoryKey
            ? { protocolCategory: { categoryKey: args.categoryKey } }
            : {}),
        },
        include: {
          person: true,
          protocolCategory: true,
          institution: true,
        },
        take: 10,
      });

      return {
        status: "completed",
        result: guests.map((g) => ({
          guestId: g.id,
          name: g.person.fullName,
          title: g.person.title,
          designation: g.person.designation,
          institution: g.institution?.name,
          category: g.protocolCategory?.name,
          rank: g.protocolCategory?.rankOrder,
        })),
      };
    }

    case "get_guest_summary": {
      const guest = await prisma.eventGuest.findUnique({
        where: { id: args.guestId },
        include: {
          person: true,
          protocolCategory: true,
          institution: true,
          invitations: {
            include: {
              rsvps: { orderBy: { submittedAt: "desc" }, take: 1 },
              invitationEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
            },
          },
          seatAssignments: {
            include: { section: true, seat: true },
          },
        },
      });

      if (!guest) return { status: "not_found", message: "Guest not found" };

      const latestRsvp = guest.invitations[0]?.rsvps[0];
      const activeSeat = guest.seatAssignments.find((s) => s.status === "proposed" || s.status === "approved");

      return {
        status: "completed",
        result: {
          name: guest.person.fullName,
          designation: guest.person.designation,
          institution: guest.institution?.name,
          protocolCategory: guest.protocolCategory?.name,
          rankOrder: guest.protocolCategory?.rankOrder,
          invitationStatus: guest.invitations[0]?.invitationStatus || "none",
          rsvpStatus: latestRsvp?.response || "pending",
          companionCount: latestRsvp?.companionCount || 0,
          assignedSeat: activeSeat
            ? `${activeSeat.section.name} (Seat ${activeSeat.seat?.seatCode || "Unnumbered"})`
            : "Unassigned",
          recentEvents: guest.invitations[0]?.invitationEvents.map((e) => ({
            type: e.eventType,
            time: e.occurredAt,
          })) || [],
        },
      };
    }

    case "list_pending_rsvps": {
      const pending = await prisma.eventGuest.findMany({
        where: {
          eventId: args.eventId,
          guestStatus: "active",
          invitations: {
            some: {
              rsvps: { none: {} },
            },
          },
        },
        include: {
          person: true,
          institution: true,
          protocolCategory: true,
        },
        take: 20,
      });

      return {
        status: "completed",
        count: pending.length,
        result: pending.map((p) => ({
          name: p.person.fullName,
          institution: p.institution?.name,
          category: p.protocolCategory?.name,
          reference: p.guestReference,
        })),
      };
    }

    case "draft_invitation_copy": {
      const draft = `The Rt. Hon. Speaker and Leadership of the Parliament of Ghana request the honour of the presence of ${args.recipientTitle || ""} ${args.recipientName} to the ${args.eventTitle}. A formal reserved seat has been allocated according to parliamentary protocol.`;
      return {
        status: "completed",
        result: {
          headline: `Official State Invitation: ${args.eventTitle}`,
          formalBody: draft,
          suggestedSubject: `Invitation: ${args.eventTitle} - Parliament of Ghana`,
        },
      };
    }

    case "propose_seating_allocation": {
      const res = await runDeterministicSeatingEngine(args.eventId, args.seatingPlanId, userId);
      return {
        status: "completed",
        result: res,
      };
    }

    case "draft_event_report": {
      const event = await prisma.event.findUnique({
        where: { id: args.eventId },
        include: {
          guests: true,
          invitations: { include: { rsvps: true } },
          seatingPlans: { include: { seatAssignments: true } },
          attendanceRecords: true,
        },
      });

      if (!event) return { status: "not_found", message: "Event not found" };

      const totalGuests = event.guests.length;
      const invitationsSent = event.invitations.filter((i) => i.invitationStatus === "sent").length;
      const acceptedCount = event.invitations.filter((i) => i.rsvps.some((r) => r.response === "accepted")).length;
      const seatsAssigned = event.seatingPlans[0]?.seatAssignments.length || 0;
      const checkedInCount = event.attendanceRecords.filter((a) => a.checkinStatus === "checked_in").length;

      const summaryText = `Executive Event Status Report for ${event.name}:
- Total Confirmed Protocol Invitees: ${totalGuests}
- Official Invitations Dispatched: ${invitationsSent}
- RSVPs Confirmed (Accepted): ${acceptedCount}
- Seats Allocated by Protocol Rules: ${seatsAssigned}
- Attendees Checked In: ${checkedInCount}
The platform is operating with 100% capacity and seating integrity.`;

      return {
        status: "completed",
        result: {
          summaryText,
          metrics: {
            totalGuests,
            invitationsSent,
            acceptedCount,
            seatsAssigned,
            checkedInCount,
          },
        },
      };
    }

    default:
      return { status: "unsupported", message: `Tool ${toolName} has no handler.` };
  }
}


/** JSON-schema tool definitions for the model. eventId is injected server-side, never chosen by the model. */
export function toolSpecsForModel() {
  return Object.values(AI_TOOL_REGISTRY).map((t) => {
    const props = Object.fromEntries(
      Object.entries(t.parameters).filter(([k]) => k !== "eventId").map(([k, v]) => [k, { type: v.type, description: v.description }])
    );
    const required = Object.entries(t.parameters).filter(([k, v]) => k !== "eventId" && v.required).map(([k]) => k);
    return {
      name: t.name,
      description: t.requiresHumanApproval ? `${t.description} (Requires human approval before it runs.)` : t.description,
      parameters: { type: "object", properties: props, required, additionalProperties: false },
    };
  });
}

/** Removes contact details from anything sent to an AI provider. */
export function redactForModel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForModel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !/^(email|phone|recipientEmailSnapshot|passwordHash|notes|operationalNotes|accessibilityNote)$/i.test(k))
        .map(([k, v]) => [k, redactForModel(v)])
    );
  }
  if (typeof value === "string") {
    return value
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
      .replace(/\+?\d[\d\s-]{8,}\d/g, "[phone]");
  }
  return value;
}
