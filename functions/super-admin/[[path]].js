// Signed-in admins are forwarded to the Super Admin console.
const DEFAULT_CONSOLE = "https://concentration-fantastic-mods-usd.trycloudflare.com";

export function onRequest({ request, env }) {
  const url = new URL(request.url);
  const base = (env.ADMIN_CONSOLE_URL || DEFAULT_CONSOLE).replace(/\/+$/, "");
  return Response.redirect(base + url.pathname + url.search, 302);
}
