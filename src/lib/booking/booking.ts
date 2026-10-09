import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { availableTimes, createSingleUseLink, tagBookingUrl } from "@/lib/calendly/client";
import { sendToCaller } from "@/lib/messaging/send";

/**
 * Qualified lead → consultation booking (Phase 4).
 * 1. Assign a designer (round-robin: active designer with a Calendly event type, least recently assigned).
 * 2. Read the designer's next 2 open consultation slots from Calendly (shown in the SMS and the designer brief).
 * 3. Create a single-use Calendly link, tagged utm_content=<booking id> so invitee.created maps back here.
 * 4. Send it to the caller by SMS/WhatsApp (provider configured in Phase 4/5; if none, the link still goes in the designer brief).
 * Never throws: failures are stored on the booking row + dead_letters so scoring is unaffected.
 */
export async function createBookingForEnquiry(enquiryId: string): Promise<{ status: string; bookingId?: string }> {
  const d = db();
  const [existing] = await d
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.enquiryId, enquiryId), inArray(schema.bookings.status, ["pending", "link_created", "link_sent", "booked"])))
    .limit(1);
  if (existing) return { status: `exists:${existing.status}`, bookingId: existing.id };

  const [enq] = await d.select().from(schema.enquiries).where(eq(schema.enquiries.id, enquiryId)).limit(1);
  if (!enq) return { status: "no_enquiry" };

  const designer = enq.assignedDesignerId
    ? (await d.select().from(schema.designers).where(eq(schema.designers.id, enq.assignedDesignerId)).limit(1))[0]
    : await pickDesigner();

  const [booking] = await d
    .insert(schema.bookings)
    .values({ enquiryId, designerId: designer?.id ?? null, status: "pending", siteVisitRequested: enq.siteVisitRequested })
    .returning();

  if (!designer?.calendlyEventTypeUri) {
    await fail(booking.id, "no active designer with a Calendly event type configured");
    return { status: "no_designer", bookingId: booking.id };
  }
  await d.update(schema.enquiries).set({ assignedDesignerId: designer.id, updatedAt: new Date() }).where(eq(schema.enquiries.id, enquiryId));

  try {
    const slots = (await availableTimes(designer.calendlyEventTypeUri, 14)).slice(0, 2).map((s) => s.start_time);
    const link = tagBookingUrl(await createSingleUseLink(designer.calendlyEventTypeUri), booking.id);
    await d
      .update(schema.bookings)
      .set({ schedulingLink: link, offeredSlots: slots, calendlyEventTypeUri: designer.calendlyEventTypeUri, status: "link_created", updatedAt: new Date() })
      .where(eq(schema.bookings.id, booking.id));

    const phone = await callerPhone(enquiryId);
    if (phone) {
      const sent = await sendToCaller({
        enquiryId,
        to: phone,
        kind: "scheduling_link",
        text: schedulingMessage({ name: enq.callerName, designer: designer.name, slots, link }),
      });
      if (sent.delivered) {
        await d.update(schema.bookings).set({ status: "link_sent", linkSentAt: new Date(), updatedAt: new Date() }).where(eq(schema.bookings.id, booking.id));
        return { status: "link_sent", bookingId: booking.id };
      }
    }
    return { status: "link_created", bookingId: booking.id };
  } catch (e) {
    await fail(booking.id, e instanceof Error ? e.message : String(e));
    return { status: "error", bookingId: booking.id };
  }
}

/** Round-robin: active designer with a Calendly event type whose most recent assignment is oldest (never-assigned first). */
export async function pickDesigner() {
  const d = db();
  const rows = await d
    .select({ designer: schema.designers })
    .from(schema.designers)
    .where(and(eq(schema.designers.active, true), isNotNull(schema.designers.calendlyEventTypeUri)))
    .orderBy(asc(sql`(select max(e.created_at) from enquiries e where e.assigned_designer_id = ${schema.designers.id}) nulls first`), asc(schema.designers.name));
  return rows[0]?.designer ?? null;
}

async function callerPhone(enquiryId: string): Promise<string | null> {
  const [row] = await db()
    .select({ phone: schema.callers.phone })
    .from(schema.enquiries)
    .innerJoin(schema.callers, eq(schema.callers.id, schema.enquiries.callerId))
    .where(eq(schema.enquiries.id, enquiryId))
    .limit(1);
  return row?.phone ?? null;
}

async function fail(bookingId: string, error: string) {
  const d = db();
  await d.update(schema.bookings).set({ status: "error", error: error.slice(0, 1000), updatedAt: new Date() }).where(eq(schema.bookings.id, bookingId));
  await d.insert(schema.deadLetters).values({ source: "calendly", externalId: bookingId, error: error.slice(0, 2000) });
}

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const formatIst = (iso: string) => IST.format(new Date(iso));

/** Caller-facing text. No prices, ever (the guardrail would flag it). */
export function schedulingMessage(m: { name: string | null; designer: string; slots: string[]; link: string }) {
  const hi = m.name ? `Hi ${m.name.split(" ")[0]}, ` : "Hi, ";
  const slotText = m.slots.length ? ` Next open times: ${m.slots.map(formatIst).join(" or ")}.` : "";
  return `${hi}thank you for calling Aangan Studio. Book your design consultation with ${m.designer}: ${m.link}${slotText}`;
}
