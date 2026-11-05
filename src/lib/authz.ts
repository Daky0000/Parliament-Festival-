import type { NextRequest } from "next/server";
import { prisma } from "./db";
import { assertConfig, appOrigin } from "./config";
import { errorResponse, forbidden, notFound, unauthorized, HttpError } from "./http";
import { sessionCookieName, validateSession, type SessionRecord } from "./session";
import type { Permission } from "./roles";

// Deny-by-default authorization. Every protected route resolves an Actor
// from the server-side session, then authorizes a named permission against a
// specific event via authorizeEvent(). Client-supplied IDs are never trusted:
// records are loaded first and their own eventId is checked.

export type Actor = {
  userId: string;
  organizationId: string;
  email: string;
  fullName: string;
  sessionId: string;
  isSuperAdmin: boolean;
  roleKeys: string[];
  /** Permissions from assignments not scoped to an event (apply to every event in the org). */
  globalPermissions: Set<string>;
  /** eventId -> permissions from event-scoped assignments. */
  eventPermissions: Map<string, Set<string>>;
  /** Events reachable through event-scoped assignments or EventUserAccess. */
  scopedEventIds: Set<string>;
};

export async function actorFromSession(session: SessionRecord | null): Promise<Actor | null> {
  if (!session || session.mfaPending) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      roleAssignments: {
        where: { revokedAt: null },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
      eventAccess: { where: { revokedAt: null }, select: { eventId: true } },
    },
  });
  if (!user || user.status !== "active") return null;

  const globalPermissions = new Set<string>();
  const eventPermissions = new Map<string, Set<string>>();
  const scopedEventIds = new Set<string>(user.eventAccess.map((a) => a.eventId));
  let isSuperAdmin = false;
  const roleKeys = new Set<string>();

  for (const a of user.roleAssignments) {
    // Roles belong to an organization; ignore anything from another org.
    if (a.role.organizationId !== user.organizationId) continue;
    roleKeys.add(a.role.key);
    const perms = a.role.permissions.map((rp) => rp.permission.key);
    if (!a.eventId) {
      perms.forEach((p) => globalPermissions.add(p));
      if (a.role.key === "super_admin") isSuperAdmin = true;
    } else {
      scopedEventIds.add(a.eventId);
      const set = eventPermissions.get(a.eventId) ?? new Set<string>();
      perms.forEach((p) => set.add(p));
      eventPermissions.set(a.eventId, set);
    }
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    email: user.email,
    fullName: user.fullName,
    sessionId: session.id,
    isSuperAdmin,
    roleKeys: [...roleKeys],
    globalPermissions,
    eventPermissions,
    scopedEventIds,
  };
}

export async function actorFromRequest(req: NextRequest | Request): Promise<Actor | null> {
  return actorFromSession(await validateSession(readCookie(req, sessionCookieName())));
}

/** For server components and layouts. */
export async function getActor(): Promise<Actor | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return actorFromSession(await validateSession(store.get(sessionCookieName())?.value));
}

export function readCookie(req: NextRequest | Request, name: string): string | undefined {
  const maybe = (req as NextRequest).cookies;
  if (maybe && typeof maybe.get === "function") return maybe.get(name)?.value;
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return undefined;
}

/** True if the actor holds `perm` for this event (or globally when no event is given). */
export function can(actor: Actor, perm: Permission, eventId?: string | null): boolean {
  if (actor.globalPermissions.has(perm)) return true;
  if (eventId) return actor.eventPermissions.get(eventId)?.has(perm) ?? false;
  return false;
}

/** True if the actor holds `perm` globally or for at least one event. */
export function canAny(actor: Actor, perm: Permission): boolean {
  if (actor.globalPermissions.has(perm)) return true;
  for (const set of actor.eventPermissions.values()) if (set.has(perm)) return true;
  return false;
}

export function requireGlobal(actor: Actor, perm: Permission): void {
  if (!can(actor, perm)) throw forbidden();
}

/** Global role holders see every event in their org; others only scoped events. */
export function hasGlobalRole(actor: Actor): boolean {
  return actor.globalPermissions.size > 0;
}

/**
 * The one way to authorize event-scoped work. Order matters: the event must
 * exist, belong to the actor's organization and be reachable by the actor
 * (otherwise 404, so existence is not revealed); only then is the permission
 * checked (403).
 */
export async function authorizeEvent(actor: Actor, perm: Permission, eventId: unknown) {
  if (typeof eventId !== "string" || !eventId) throw notFound();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.organizationId !== actor.organizationId) throw notFound();
  if (!hasGlobalRole(actor) && !actor.scopedEventIds.has(eventId)) throw notFound();
  if (!can(actor, perm, eventId)) throw forbidden();
  return event;
}

export async function accessibleEvents(actor: Actor) {
  return prisma.event.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(hasGlobalRole(actor) ? {} : { id: { in: [...actor.scopedEventIds] } }),
    },
    orderBy: { startsAt: "asc" },
  });
}

/** CSRF: state-changing requests must come from our own origin. */
export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin || origin !== appOrigin()) throw new HttpError(403, "Cross-origin request rejected");
}

/** Client IP as seen by Cloudflare. Never trust X-Forwarded-For. */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") || "unknown";
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a route handler: config check, session -> actor (401), CSRF (403),
 * error mapping. Anonymous requests always get 401, even cross-origin ones.
 */
export function withActor<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: { actor: Actor; params: P }) => Promise<Response>
) {
  return async (req: NextRequest, context?: RouteContext<P>): Promise<Response> => {
    try {
      assertConfig();
      const actor = await actorFromRequest(req);
      if (!actor) throw unauthorized();
      assertSameOrigin(req);
      const params = context?.params ? await context.params : ({} as P);
      return await handler(req, { actor, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** For unauthenticated endpoints that still need CSRF + error mapping (auth flows). */
export function withOrigin<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: P }) => Promise<Response>
) {
  return async (req: NextRequest, context?: RouteContext<P>): Promise<Response> => {
    try {
      assertConfig();
      assertSameOrigin(req);
      const params = context?.params ? await context.params : ({} as P);
      return await handler(req, { params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
