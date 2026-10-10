"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db/client";
import { requireAuth } from "@/lib/auth";
import { createBookingForEnquiry } from "@/lib/booking/booking";
import { syncEnquiryToHubspot } from "@/lib/hubspot/sync";

/** Check 05: "consultation held" is a manual mark; timestamped, never inferred. */
export async function markConsultationHeld(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const now = new Date();
  await db().update(schema.enquiries).set({ status: "CONSULTATION_HELD", consultationHeldAt: now, updatedAt: now }).where(eq(schema.enquiries.id, id));
  await db().update(schema.bookings).set({ status: "held", updatedAt: now }).where(eq(schema.bookings.enquiryId, id));
  await syncEnquiryToHubspot(id, "held");
  revalidatePath("/dashboard");
}

/** Check 07: NEEDS_REVIEW is decided by a human (Nikhil). Qualify → books like any qualified lead; Decline → closed. */
export async function resolveReview(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const now = new Date();
  if (decision === "qualify") {
    await db().update(schema.enquiries).set({ status: "QUALIFIED", ownerType: "system", reviewedAt: now, reviewedBy: "nikhil", updatedAt: now }).where(eq(schema.enquiries.id, id));
    await createBookingForEnquiry(id);
  } else if (decision === "decline") {
    await db()
      .update(schema.enquiries)
      .set({ status: "DECLINED", declineReason: "declined after human review", ownerType: "nikhil", reviewedAt: now, reviewedBy: "nikhil", updatedAt: now })
      .where(eq(schema.enquiries.id, id));
  }
  await syncEnquiryToHubspot(id, "reviewed");
  revalidatePath("/dashboard");
}
