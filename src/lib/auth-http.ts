import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, sessionCookieOptions, validateSession } from "./session";
import { readCookie } from "./authz";
import { unauthorized } from "./http";

export const EVENT_COOKIE = "pf_event";

export function setSessionCookie(res: NextResponse, rawToken: string): NextResponse {
  res.cookies.set(sessionCookieName(), rawToken, sessionCookieOptions());
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}

export function rawSessionToken(req: NextRequest): string | undefined {
  return readCookie(req, sessionCookieName());
}

/** A session that is still waiting for MFA. Only the MFA endpoints accept it. */
export async function requirePendingSession(req: NextRequest) {
  const s = await validateSession(rawSessionToken(req));
  if (!s || !s.mfaPending) throw unauthorized();
  return s;
}
