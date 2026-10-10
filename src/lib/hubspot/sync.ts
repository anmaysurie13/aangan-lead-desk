import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { signedLink } from "@/lib/auth";
import { formatIst } from "@/lib/time";
import { createContact, createDeal, createNote, findContact, hubspotConfigured, updateContact, updateDeal } from "./client";

/**
 * Mirrors an enquiry into HubSpot for the founder: contact (always, once we know who they are), deal (qualified leads
 * only; no amount is ever set because we never quote), and notes (brief at first sync, then booking/claim/held events).
 * Idempotent and safe to call repeatedly. Never throws: a HubSpot outage must never affect scoring or booking.
 */

/** HubSpot default lead status values: NEW, OPEN, IN_PROGRESS, OPEN_DEAL, UNQUALIFIED, … */
export function leadStatusFor(status: string, outcome: string | null): string {
  if (status === "BOOKED" || status === "CONSULTATION_HELD") return "OPEN_DEAL";
  if (status === "CLAIMED") return "IN_PROGRESS";
  if (outcome === "ESCALATED" || status === "ESCALATED") return "IN_PROGRESS";
  if (outcome === "DECLINED" || status === "DECLINED") return "UNQUALIFIED";
  if (outcome === "NEEDS_REVIEW" || status === "NEEDS_REVIEW") return "NEW";
  return "OPEN"; // QUALIFIED, QUALIFIED_WITH_NOTE
}

/** Default "Sales Pipeline" stages (verified live). Qualified → Qualified To Buy; consultation booked/held → Presentation Scheduled. */
export function dealStageFor(status: string): string | null {
  if (status === "BOOKED" || status === "CONSULTATION_HELD") return "presentationscheduled";
  if (["QUALIFIED", "QUALIFIED_WITH_NOTE", "CLAIMED"].includes(status)) return "qualifiedtobuy";
  return null; // declined / escalated / needs review: contact only, no deal
}

const splitName = (full: string | null) => {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstname: parts[0] ?? "", lastname: parts.slice(1).join(" ") };
};

export async function syncEnquiryToHubspot(enquiryId: string, event?: string): Promise<{ status: string }> {
  if (!hubspotConfigured()) return { status: "not_configured" };
  const d = db();
  try {
    const [e] = await d.select().from(schema.enquiries).where(eq(schema.enquiries.id, enquiryId)).limit(1);
    if (!e) return { status: "no_enquiry" };
    const [caller] = e.callerId ? await d.select().from(schema.callers).where(eq(schema.callers.id, e.callerId)).limit(1) : [];
    const [qr] = await d.select().from(schema.qualificationResults).where(eq(schema.qualificationResults.enquiryId, enquiryId)).orderBy(desc(schema.qualificationResults.createdAt)).limit(1);
    const [booking] = await d.select().from(schema.bookings).where(eq(schema.bookings.enquiryId, enquiryId)).orderBy(desc(schema.bookings.createdAt)).limit(1);
    const phone = caller?.phone ?? null;
    const email = e.callerEmail ?? null;
    const outcome = qr?.outcome ?? null;
    const first = !e.hubspotContactId;

    // ---- contact ----
    const { firstname, lastname } = splitName(e.callerName ?? caller?.name ?? null);
    const props: Record<string, string> = {
      ...(firstname ? { firstname } : {}),
      ...(lastname ? { lastname } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(e.locality ? { city: e.locality } : {}),
      hs_lead_status: leadStatusFor(e.status, outcome),
    };
    let contactId = e.hubspotContactId;
    if (!contactId) {
      const existing = await findContact({ email, phone });
      if (existing) {
        contactId = existing.id;
        await updateContact(contactId, props);
      } else {
        contactId = (await createContact({ ...props, lifecyclestage: ["QUALIFIED", "QUALIFIED_WITH_NOTE"].includes(outcome ?? "") ? "salesqualifiedlead" : "lead" })).id;
      }
    } else await updateContact(contactId, props);

    // ---- deal (qualified leads only) ----
    const stage = dealStageFor(e.status);
    let dealId = e.hubspotDealId;
    if (stage) {
      const dealName = [e.callerName ?? "Enquiry", e.bhk ?? e.propertyType, e.locality].filter(Boolean).join(" · ");
      const dealProps: Record<string, string> = { dealname: dealName, pipeline: "default", dealstage: stage, ...(qr?.summary3Lines ? { description: qr.summary3Lines } : {}) };
      if (!dealId) dealId = (await createDeal(dealProps, contactId)).id;
      else await updateDeal(dealId, { dealstage: stage, dealname: dealName });
    }

    // ---- notes ----
    const lead = signedLink("lead", { e: enquiryId });
    const lines: string[] = [];
    if (first) {
      lines.push(`Aangan Lead Desk · ${outcome ?? e.status}${qr ? ` · score ${qr.score}` : ""}`, "", qr?.briefForDesigner ?? "Not scored.", "");
      const crit = (qr?.criteria ?? {}) as Record<string, { status: string; evidence_quote: string }>;
      for (const [k, c] of Object.entries(crit)) lines.push(`- ${k.replace("_", " ")}: ${c.status}${c.evidence_quote ? ` ("${c.evidence_quote}")` : ""}`);
      lines.push("", `Transcript and details: ${lead}`);
    } else if (event === "booked" && booking?.slotStart) lines.push(`Consultation booked for ${formatIst(booking.slotStart.toISOString())} IST.`, `Details: ${lead}`);
    else if (event === "claimed") lines.push("A designer accepted this lead.", `Details: ${lead}`);
    else if (event === "held") lines.push("Consultation held (marked on the dashboard).");
    else if (event === "reviewed") lines.push(`Human review decision: ${e.status}.`);
    if (lines.length) await createNote(lines.join("\n"), contactId, dealId);

    await d
      .update(schema.enquiries)
      .set({ hubspotContactId: contactId, hubspotDealId: dealId, hubspotSyncedAt: new Date(), hubspotError: null })
      .where(eq(schema.enquiries.id, enquiryId));
    return { status: first ? "created" : "updated" };
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await d.update(schema.enquiries).set({ hubspotError: msg }).where(eq(schema.enquiries.id, enquiryId));
    await d.insert(schema.deadLetters).values({ source: "hubspot", externalId: enquiryId, error: msg });
    return { status: "error" };
  }
}
