import { clearSession } from "../lib/auth.js";

export function onRequest() {
  const headers = new Headers({ Location: "/login", "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearSession());
  headers.append("Set-Cookie", "pp_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"); // the pre-roles cookie
  return new Response(null, { status: 303, headers });
}
