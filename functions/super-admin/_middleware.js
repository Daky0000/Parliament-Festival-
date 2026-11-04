import { readSession } from "../../lib/auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  if (await readSession(request, env)) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "no-store");
    return out;
  }
  const url = new URL(request.url);
  return Response.redirect(`${url.origin}/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
}
