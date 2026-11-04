import { clearSession } from "../lib/auth.js";

export function onRequest() {
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": clearSession() } });
}
