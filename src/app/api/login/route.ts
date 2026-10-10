import { NextResponse, type NextRequest } from "next/server";
import { newSessionToken, passwordOk, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Password login. A fixed delay on failure slows guessing; the password is long/random by default. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = String(form.get("next") ?? "/dashboard");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (!passwordOk(String(form.get("password") ?? ""))) {
    await new Promise((r) => setTimeout(r, 1200));
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(safeNext)}`, req.url), 303);
  }
  const res = NextResponse.redirect(new URL(safeNext, req.url), 303);
  res.cookies.set(SESSION_COOKIE, newSessionToken(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  return res;
}
