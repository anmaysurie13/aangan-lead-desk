import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { verifySignedParams } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Check 04: designers rate each brief 1–5 straight from the email. One tap; idempotent (last tap wins). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const r = Number(p.get("r"));
  const html = (msg: string, status = 200) =>
    new NextResponse(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#fdf9f0;display:grid;place-items:center;min-height:100vh"><div style="padding:24px;background:#fff;border:2px solid #111;border-radius:18px;box-shadow:6px 6px 0 #111;font-weight:700">${msg}</div></body>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!verifySignedParams("rate", p) || !Number.isInteger(r) || r < 1 || r > 5) return html("Invalid link", 400);
  await db().update(schema.enquiries).set({ briefRating: r, updatedAt: new Date() }).where(eq(schema.enquiries.id, p.get("e")!));
  return html(`Thanks. Brief rated ${r}/5.`);
}
