import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { verifyCalendlySignature } from "@/lib/calendly/client";
import { markBooked } from "@/lib/booking/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InviteePayload = {
  uri?: string;
  status?: string;
  tracking?: { utm_source?: string | null; utm_content?: string | null };
  scheduled_event?: { uri?: string; start_time?: string; end_time?: string; event_type?: string };
};

/**
 * Calendly → us (invitee.created / invitee.canceled), signed with CALENDLY_WEBHOOK_SIGNING_KEY.
 * Match: tracking.utm_content = our booking id (set on the single-use link). Fallback: the only open
 * booking for that event type. Anything unmatched is dead-lettered for a human, never guessed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  const valid = Boolean(key) && verifyCalendlySignature(raw, req.headers.get("calendly-webhook-signature"), key!);
  const d = db();

  let body: { event?: string; payload?: InviteePayload } = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* handled below */
  }
  const p = body.payload ?? {};
  await d.insert(schema.webhookReceipts).values({ source: "calendly", externalId: p.uri ?? null, signatureValid: valid });
  if (!valid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (body.event !== "invitee.created" && body.event !== "invitee.canceled") return NextResponse.json({ status: "ignored" });

  const ev = p.scheduled_event ?? {};
  let [booking] = p.tracking?.utm_content
    ? await d.select().from(schema.bookings).where(eq(schema.bookings.id, p.tracking.utm_content)).limit(1).catch(() => [])
    : [];
  if (!booking && ev.event_type) {
    const open = await d
      .select()
      .from(schema.bookings)
      .where(and(eq(schema.bookings.calendlyEventTypeUri, ev.event_type), inArray(schema.bookings.status, ["link_created", "link_sent"])))
      .orderBy(desc(schema.bookings.createdAt))
      .limit(2);
    if (open.length === 1) booking = open[0];
  }
  if (!booking) {
    await d.insert(schema.deadLetters).values({ source: "calendly_unmatched", externalId: p.uri ?? null, payload: body, error: "no booking matched this invitee" });
    return NextResponse.json({ status: "unmatched" });
  }

  const now = new Date();
  if (body.event === "invitee.created") {
    await markBooked(booking.id, { eventUri: ev.uri ?? null, inviteeUri: p.uri ?? null, start: ev.start_time ? new Date(ev.start_time) : null, end: ev.end_time ? new Date(ev.end_time) : null });
  } else {
    await d.update(schema.bookings).set({ status: "cancelled", updatedAt: now }).where(eq(schema.bookings.id, booking.id));
    // Back to qualified so the owner sees it needs a new slot.
    await d.update(schema.enquiries).set({ status: "QUALIFIED", bookedAt: null, updatedAt: now }).where(eq(schema.enquiries.id, booking.enquiryId));
  }
  return NextResponse.json({ status: "ok" });
}
