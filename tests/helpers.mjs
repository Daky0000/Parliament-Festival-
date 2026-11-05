// Shared helpers for route-level tests. Handlers are imported and called
// directly with a NextRequest, exactly as Next.js would call them.
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db.ts";
import { createSession, sessionCookieName } from "../src/lib/session.ts";

export const ORIGIN = "http://localhost:3000";

export async function userByEmail(email) {
  const u = await prisma.user.findFirst({ where: { email } });
  if (!u) throw new Error(`Seeded user ${email} missing — run the seed first`);
  return u;
}

/** Creates a real server-side session and returns a Cookie header for it. */
export async function cookieFor(email, { mfaPending = false } = {}) {
  const user = await userByEmail(email);
  const { rawToken } = await createSession(user.id, { mfaPending });
  return `${sessionCookieName()}=${rawToken}`;
}

export function request(path, { method = "GET", cookie, origin = ORIGIN, body } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Calls an exported route handler with params resolved like Next.js does. */
export async function call(handler, req, params = {}) {
  const res = await handler(req, { params: Promise.resolve(params) });
  let json = null;
  try {
    json = await res.clone().json();
  } catch {
    /* not json */
  }
  return { status: res.status, json, res };
}

export async function seededFixtures() {
  const event = await prisma.event.findFirstOrThrow({ where: { eventCode: "CAROLS-2026" } });
  const plan = await prisma.seatingPlan.findFirst({ where: { eventId: event.id } });
  const category = await prisma.protocolCategory.findFirst({ where: { eventId: event.id } });
  const guest = await prisma.eventGuest.findFirst({ where: { eventId: event.id } });
  const campaign = await prisma.invitationCampaign.findFirst({ where: { eventId: event.id } });
  const usher = await userByEmail("usher@parliament.gh");
  return { event, plan, category, guest, campaign, usher };
}
