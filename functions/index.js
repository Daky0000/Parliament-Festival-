import { readSession, HOME } from "../lib/auth.js";

// There is no public home page: the site is a sign-in. Signed-in people go to their own area.
export async function onRequest({ request, env }) {
  const who = await readSession(request, env);
  return Response.redirect(new URL(who ? HOME[who.role] : "/login", request.url).toString(), 302);
}
