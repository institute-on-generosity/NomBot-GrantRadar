import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isAdminCookie, signInPage } from "@/lib/adminAuth";

// Optional sign-in gate for a publicly reachable copy (e.g. through a Cloudflare tunnel): when SITE_PASSWORD
// is set, every page and API asks for it with HTTP Basic auth (any user name). Unset in development.
// Without it, anyone with the link could run searches billed to the Claude API key.
// Partner API paths skip this gate: /api/v1/* and /mcp check a Bearer API key in their route handlers
// (lib/apiAuth.ts, a database lookup that doesn't belong in the proxy), and the API docs are public.
const KEYED = /^\/(api\/v1(\/|$)|mcp\/?$)/;
const PUBLIC = /^\/api\/(docs|openapi\.json)\/?$/;
// The Linux helper's heartbeat skips both gates: the route checks its own Bearer HEARTBEAT_TOKEN (lib/adminAuth.ts).
const HEARTBEAT = /^\/api\/admin\/heartbeat\/?$/;
// Internal dashboard: after SITE_PASSWORD, a second gate (ADMIN_PASSWORD, signed cookie) even in development.
const ADMIN = /^\/(admin|api\/admin)(\/|$)/;
const LOGIN = /^\/api\/admin\/login\/?$/;

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (KEYED.test(path) || PUBLIC.test(path) || HEARTBEAT.test(path)) return NextResponse.next();
  const password = process.env.SITE_PASSWORD;
  if (password && !isLocal(request) && !siteSignedIn(request, password)) {
    return new NextResponse("Sign in required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="IoG", charset="UTF-8"' } });
  }
  if (ADMIN.test(path) && !LOGIN.test(path) && !isAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) {
    const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
    if (path.startsWith("/api/")) return Response.json({ error: "admin_required" }, { status: 401, headers });
    return new NextResponse(signInPage(request.nextUrl.searchParams.has("wrong")), { status: 401, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.next();
}

// Opened on this Mac (http://localhost:4000): no site password. The public Tailscale link also reaches the server
// from 127.0.0.1, but Tailscale sets the Host to the ts.net name, X-Forwarded-For to the real client and adds
// Tailscale-* headers, so "local" needs all three: a localhost Host, a loopback X-Forwarded-For and no Tailscale
// header. The /admin gate still applies.
function isLocal(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  const fwd = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim());
  const tailscale = [...request.headers.keys()].some((k) => k.startsWith("tailscale-"));
  return ["localhost", "127.0.0.1", "[::1]"].includes(host) && fwd.every((ip) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) && !tailscale;
}

function siteSignedIn(request: NextRequest, password: string) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = atob(header.slice(6));
  return decoded.slice(decoded.indexOf(":") + 1) === password;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
