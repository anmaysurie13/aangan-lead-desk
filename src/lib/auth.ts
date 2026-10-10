import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Dashboard auth: a single shared password (DASHBOARD_PASSWORD), no accounts to manage.
 * Login sets an httpOnly cookie holding a hash derived from the password + AUTH_SECRET, so the password
 * itself never sits in the browser and changing either env var logs everyone out.
 * Signed links (designer claim / rate buttons in emails) use HMAC with AUTH_SECRET.
 */
export const SESSION_COOKIE = "ald_session";

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function sessionValue() {
  const pw = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!pw || !secret) return null;
  return createHash("sha256").update(`${secret}:${pw}:dashboard-session`).digest("hex");
}

export function passwordOk(input: string): boolean {
  const pw = process.env.DASHBOARD_PASSWORD;
  return Boolean(pw) && safeEq(input, pw!);
}

export function newSessionToken(): string {
  const v = sessionValue();
  if (!v) throw new Error("DASHBOARD_PASSWORD and AUTH_SECRET must be set");
  return v;
}

export async function isAuthed(): Promise<boolean> {
  const v = sessionValue();
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(v && c && safeEq(c, v));
}

/** Server components / actions call this first; unauthenticated users go to /login. */
export async function requireAuth(next = "/dashboard") {
  if (!(await isAuthed())) redirect(`/login?next=${encodeURIComponent(next)}`);
}

// ---------- signed email links ----------
function sig(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
}

type SignedKind = "claim" | "rate" | "lead";

export function signedLink(path: SignedKind, params: Record<string, string>): string {
  const base = process.env.APP_BASE_URL ?? "";
  const q = new URLSearchParams(params);
  const payload = `${path}?${q.toString()}`;
  q.set("t", sig(payload));
  return `${base}${path === "lead" ? "/lead" : `/api/${path}`}?${q.toString()}`;
}

export function verifySignedParams(path: SignedKind, searchParams: URLSearchParams): boolean {
  const t = searchParams.get("t");
  if (!t) return false;
  const q = new URLSearchParams(searchParams);
  q.delete("t");
  return safeEq(t, sig(`${path}?${q.toString()}`));
}
