import { NextResponse, type NextRequest } from "next/server";

// Optimistic fast path only: no session cookie -> send to /login. The real
// checks happen server-side in layouts, page guards and every API route.
// Security headers are added to every matched response.

const SESSION_COOKIES = ["__Host-pf_session", "pf_session"];

const PROTECTED_PREFIXES = [
  "/guests", "/protocol", "/invitations", "/rsvps", "/seating", "/attendance",
  "/ai-centre", "/reports", "/passes", "/super-admin", "/usher", "/account", "/check-in",
];

function isProtected(pathname: string): boolean {
  if (pathname === "/") return true;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function withSecurityHeaders(res: NextResponse, pathname: string): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  // Activation and invitation links carry tokens in the path.
  res.headers.set(
    "Referrer-Policy",
    pathname.startsWith("/activate") || pathname.startsWith("/public") || pathname.startsWith("/check-in")
      ? "no-referrer"
      : "strict-origin-when-cross-origin"
  );
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((n) => request.cookies.has(n));
  if (isProtected(pathname) && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(url), pathname);
  }
  return withSecurityHeaders(NextResponse.next(), pathname);
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|assets|fonts|favicon\.svg|favicon\.ico).*)"],
};
