import { NextResponse, type NextRequest } from "next/server";

// Optional sign-in gate for a publicly reachable copy (e.g. through a Cloudflare tunnel): when SITE_PASSWORD
// is set, every page and API asks for it with HTTP Basic auth (any user name). Unset in development.
// Without it, anyone with the link could run searches billed to the Claude API key.
export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }
  return new NextResponse("Sign in required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="IoG", charset="UTF-8"' } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
