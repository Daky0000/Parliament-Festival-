import { authenticate, createSession, readSession, landingFor, HOME } from "../lib/auth.js";
import { getUser, putUser, logEvent } from "../lib/users.js";
import { loginPage } from "../lib/ui.js";

const nextOf = (v) => (typeof v === "string" ? v : "");

export async function onRequestGet({ request, env }) {
  const next = nextOf(new URL(request.url).searchParams.get("next"));
  const who = await readSession(request, env);
  if (who) return Response.redirect(new URL(landingFor(who.role, next), request.url).toString(), 302);
  return loginPage(next);
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const next = nextOf(form.get("next"));
  if (!env.SESSION_SECRET || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH) {
    return loginPage(next, "Sign-in is not available right now.", email);
  }
  if (!email || !password) return loginPage(next, "Enter your email and password.", email);

  const who = await authenticate(env, email, password);
  if (!who) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return loginPage(next, "Incorrect email or password.", email);
  }
  if (who.role !== "super" && env.USERS) {
    const user = await getUser(env, who.email);
    if (user) await putUser(env, { ...user, lastLogin: Date.now() });
  }
  if (env.USERS) await logEvent(env, who.name, `${who.name} signed in`, who.role);
  return new Response(null, {
    status: 303,
    headers: { Location: landingFor(who.role, next) || HOME[who.role], "Set-Cookie": await createSession(env, who), "Cache-Control": "no-store" },
  });
}
