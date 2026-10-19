// Admin sign-in for /admin (form post from the proxy's sign-in page). Sets the signed admin cookie
// (lib/adminAuth.ts) and goes back to /admin. Wrong password: back to the sign-in page with a note.
// Sign out: POST with action=out.
import { ADMIN_COOKIE, adminCookie, isAdminPassword, loginAllowed } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const secure = proto === "https" ? "; Secure" : "";
  const back = (to: string, cookie?: string) => new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
  if (form?.get("action") === "out") return back("/", `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
  const client = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!loginAllowed(client)) return new Response("Too many tries. Wait a minute.", { status: 429, headers: { "Retry-After": "60" } });
  const password = String(form?.get("password") ?? "");
  const cookie = isAdminPassword(password) ? adminCookie() : null;
  if (!cookie) return back("/admin?wrong");
  return back("/admin", `${ADMIN_COOKIE}=${cookie.value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookie.maxAge}${secure}`);
}
