import { prisma } from "./db";
import crypto from "crypto";

export interface AuditParams {
  organizationId: string;
  eventId?: string;
  actorUserId?: string;
  actorType?: "user" | "system" | "ai" | "integration";
  action: string;
  entityType: string;
  entityId?: string;
  outcome?: "success" | "denied" | "failed";
  reason?: string;
  beforeData?: any;
  afterData?: any;
  correlationId?: string;
  ipAddress?: string;
}

export async function logAuditEvent(params: AuditParams) {
  try {
    const ipHash = params.ipAddress
      ? crypto.createHash("sha256").update(params.ipAddress).digest("hex")
      : undefined;

    return await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        eventId: params.eventId,
        actorUserId: params.actorUserId,
        actorType: params.actorType || "user",
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        outcome: params.outcome || "success",
        reason: params.reason,
        beforeData: params.beforeData ? JSON.stringify(params.beforeData) : null,
        afterData: params.afterData ? JSON.stringify(params.afterData) : null,
        correlationId: params.correlationId || crypto.randomUUID(),
        ipHash,
      },
    });
  } catch (error) {
    // Non-blocking for primary transaction, but logged to stderr
    console.error("Failed to write audit log:", error);
    return null;
  }
}

