import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { availableTimes, createSingleUseLink, getMe, listInvitees, listScheduledEvents, tagBookingUrl } from "@/lib/calendly/client";
import { isEmail, sendEmail } from "@/lib/messaging/send";
import { signedLink } from "@/lib/auth";
import { formatIst } from "@/lib/time";
import { syncEnquiryToHubspot } from "@/lib/hubspot/sync";

/**
 * Qualified lead → consultation booking (Phase 4).
 * 1. Assign a designer (round-robin: active designer with a Calendly event type, least recently assigned).
 * 2. Read the designer's next 2 open consultation slots from Calendly (shown in both emails).
 * 3. Create a single-use Calendly link, tagged utm_content=<booking id> so invitee.created maps back here.
 * 4. Email the link to the caller (address spelled + confirmed on the call) and email the designer the brief + the same link.
 *    No caller email → the designer email says so and the designer shares the link by phone.
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
    const slots = pickSlots((await availableTimes(designer.calendlyEventTypeUri, 14)).map((s) => s.start_time));
    const link = tagBookingUrl(await createSingleUseLink(designer.calendlyEventTypeUri), booking.id);
    await d
      .update(schema.bookings)
      .set({ schedulingLink: link, offeredSlots: slots, calendlyEventTypeUri: designer.calendlyEventTypeUri, status: "link_created", updatedAt: new Date() })
      .where(eq(schema.bookings.id, booking.id));

    const phone = await callerPhone(enquiryId);
    let status = "link_created";
    if (isEmail(enq.callerEmail)) {
      const sent = await sendEmail({
        to: enq.callerEmail,
        subject: "Book your Aangan Studio design consultation",
        text: schedulingMessage({ name: enq.callerName, designer: designer.name, slots, link }),
        kind: "scheduling_link",
        enquiryId,
        callerFacing: true,
      });
      if (sent.delivered) {
        status = "link_sent";
        await d.update(schema.bookings).set({ status, linkSentAt: new Date(), updatedAt: new Date() }).where(eq(schema.bookings.id, booking.id));
      }
    }
    if (designer.email) {
      const [qr] = await d
        .select()
        .from(schema.qualificationResults)
        .where(eq(schema.qualificationResults.enquiryId, enquiryId))
        .orderBy(desc(schema.qualificationResults.createdAt))
        .limit(1);
      await sendEmail({
        to: designer.email,
        subject: `New ${enq.status === "QUALIFIED_WITH_NOTE" ? "lead (with note)" : "lead"}: ${enq.callerName ?? "caller"}, ${enq.locality ?? "locality unknown"}`,
        text: designerBrief({ enq, phone, link, slots, linkEmailed: status === "link_sent", claimUrl: signedLink("claim", { e: enquiryId, d: designer.id }), leadUrl: signedLink("lead", { e: enquiryId }), rateUrls: [1, 2, 3, 4, 5].map((n) => signedLink("rate", { e: enquiryId, r: String(n) })), summary: qr?.summary3Lines, brief: qr?.briefForDesigner, openQuestions: (qr?.openQuestions as string[] | undefined) ?? [] }),
        kind: "hot_lead",
        enquiryId,
        recipientDesignerId: designer.id,
      });
      await d.update(schema.enquiries).set({ briefSentAt: new Date() }).where(eq(schema.enquiries.id, enquiryId));
    }
    if (status === "link_sent") return { status, bookingId: booking.id };
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
    .orderBy(sql`(select max(e.created_at) from enquiries e where e.assigned_designer_id = ${schema.designers.id}) asc nulls first`, asc(schema.designers.name));
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

export { formatIst };

/** Caller-facing text. No prices, ever (the guardrail would flag it). */
export function schedulingMessage(m: { name: string | null; designer: string; slots: string[]; link: string }) {
  const hi = m.name ? `Hi ${m.name.split(" ")[0]}, ` : "Hi, ";
  const slotText = m.slots.length ? ` Next open times: ${m.slots.map(formatIst).join(" or ")}.` : "";
  return `${hi}thank you for calling Aangan Studio. Book your design consultation with ${m.designer}: ${m.link}${slotText}`;
}

type EnquiryRow = typeof schema.enquiries.$inferSelect;
const v = (x: unknown) => (x === null || x === undefined || x === "" ? "unknown" : String(x));

/** Check 04: every field present or explicitly "unknown". Internal email, so it may mention a volunteered budget but never a quote. */
export function designerBrief(b: {
  enq: EnquiryRow;
  phone: string | null;
  link: string;
  slots: string[];
  linkEmailed: boolean;
  claimUrl?: string;
  leadUrl?: string;
  rateUrls?: string[];
  summary?: string;
  brief?: string;
  openQuestions: string[];
}) {
  const e = b.enq;
  return [
    `Who: ${v(e.callerName)} · ${v(b.phone)} · ${v(e.callerEmail)}`,
    `Where: ${v(e.locality)}`,
    `Property: ${v(e.propertyType)} · ${v(e.bhk)} · ${e.carpetAreaSqft ? `${e.carpetAreaSqft} sq ft carpet` : "area unknown"} · ${v(e.ownership)}`,
    `Scope: ${v(e.scope)} · current state: ${v(e.currentState)}`,
    `Timeline: ${v(e.timelineText)}${e.timelineWeeks ? ` (~${e.timelineWeeks} weeks)` : ""}`,
    `Decision-maker: ${v(e.decisionMakerStatus)}`,
    `Referral: ${v(e.referralSource)} · language: ${v(e.language)} · site visit wanted: ${v(e.siteVisitRequested)}`,
    `Status: ${e.status}`,
    "",
    `Summary:\n${v(b.summary)}`,
    "",
    `Open questions:\n${b.openQuestions.length ? b.openQuestions.map((q) => `- ${q}`).join("\n") : "- none"}`,
    "",
    `Booking link (single-use): ${b.link}`,
    `Next open slots: ${b.slots.length ? b.slots.map(formatIst).join(" | ") : "none in the next 14 days"}`,
    b.linkEmailed ? "The link has been emailed to the caller." : "The caller has NOT received the link (no confirmed email). Please call them and share it.",
    "",
    `Full brief:\n${v(b.brief)}`,
    ...(b.leadUrl ? ["", `Transcript and details: ${b.leadUrl}`] : []),
    ...(b.claimUrl ? ["", `I'll take it (confirm you will call back): ${b.claimUrl}`] : []),
    ...(b.rateUrls ? ["", `Was this brief useful? ${b.rateUrls.map((u, i) => `${i + 1}: ${u}`).join("   ")}`] : []),
  ].join("\n");
}

/** A booking was made through our link (webhook invitee.created, or found by polling). Idempotent. */
export async function markBooked(bookingId: string, b: { eventUri: string | null; inviteeUri: string | null; start: Date | null; end: Date | null }) {
  const d = db();
  const [bk] = await d.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
  if (!bk || bk.status === "booked" || bk.status === "held") return false;
  const now = new Date();
  await d.update(schema.bookings).set({ status: "booked", calendlyEventUri: b.eventUri, calendlyInviteeUri: b.inviteeUri, slotStart: b.start, slotEnd: b.end, updatedAt: now }).where(eq(schema.bookings.id, bookingId));
  await d.update(schema.enquiries).set({ status: "BOOKED", bookedAt: now, updatedAt: now }).where(eq(schema.enquiries.id, bk.enquiryId));
  await syncEnquiryToHubspot(bk.enquiryId, "booked");
  return true;
}

/**
 * Fallback for plans without Calendly webhooks: ask Calendly for upcoming events and match their invitees'
 * utm_content to our open bookings. Cheap (only runs while a link is outstanding).
 */
export async function pollCalendlyBookings(): Promise<{ checked: number; booked: number }> {
  if (!process.env.CALENDLY_TOKEN) return { checked: 0, booked: 0 };
  const d = db();
  const open = await d.select().from(schema.bookings).where(inArray(schema.bookings.status, ["link_created", "link_sent"]));
  if (!open.length) return { checked: 0, booked: 0 };
  const me = await getMe();
  const earliest = new Date(Math.min(...open.map((o) => o.createdAt.getTime())));
  const events = await listScheduledEvents(me.uri, earliest);
  const wanted = new Set(open.map((o) => o.id));
  let booked = 0;
  for (const ev of events.slice(0, 30)) {
    for (const inv of await listInvitees(ev.uri)) {
      const id = inv.tracking?.utm_content;
      if (id && wanted.has(id) && inv.status === "active") {
        if (await markBooked(id, { eventUri: ev.uri, inviteeUri: inv.uri, start: new Date(ev.start_time), end: new Date(ev.end_time) })) booked++;
      }
    }
  }
  return { checked: open.length, booked };
}

/** Two useful options: the earliest slot, plus the earliest slot on a different IST day (so choices aren't 30 minutes apart). */
export function pickSlots(starts: string[]): string[] {
  if (starts.length <= 1) return starts;
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
  const first = starts[0];
  const other = starts.find((s) => day(s) !== day(first));
  return other ? [first, other] : [first, starts[1]];
}