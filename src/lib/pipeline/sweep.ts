import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { processCall } from "./process-call";

const STUCK_AFTER_MIN = 6; // > function maxDuration (5 min), so a live run is never double-processed
const MAX_ATTEMPTS = 3;

/**
 * Check 06 safety net. A call whose transcript arrived but never finished scoring (function killed at the
 * time limit, deploy mid-run, provider outage) is retried; after MAX_ATTEMPTS it goes to dead_letters and
 * its enquiry to NEEDS_REVIEW, owned by Nikhil, so no lead is ever silently lost.
 * Runs opportunistically after each Vaani webhook and from /api/cron/sweep.
 */
export async function sweepStuckCalls(limit = 3): Promise<{ retried: number; deadLettered: number }> {
  const d = db();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MIN * 60_000);
  const stuck = await d
    .select()
    .from(schema.calls)
    .where(
      and(
        isNotNull(schema.calls.transcriptText),
        or(
          and(eq(schema.calls.processingStatus, "received"), lt(schema.calls.receivedAt, cutoff)),
          and(eq(schema.calls.processingStatus, "processing"), lt(schema.calls.processingStartedAt, cutoff)),
        ),
      ),
    )
    .limit(limit);

  let retried = 0;
  let deadLettered = 0;
  for (const c of stuck) {
    if (c.processingAttempts >= MAX_ATTEMPTS) {
      await d.insert(schema.deadLetters).values({
        source: "pipeline_stuck",
        externalId: c.vaaniCallId,
        payload: { callRowId: c.id, attempts: c.processingAttempts },
        error: `call stuck in '${c.processingStatus}' after ${c.processingAttempts} attempts`,
        attempts: c.processingAttempts,
      });
      await d.update(schema.calls).set({ processingStatus: "failed" }).where(eq(schema.calls.id, c.id));
      if (c.enquiryId) {
        await d
          .update(schema.enquiries)
          .set({ status: "NEEDS_REVIEW", ownerType: "nikhil", updatedAt: new Date() })
          .where(and(eq(schema.enquiries.id, c.enquiryId), inArray(schema.enquiries.status, ["OPEN"])));
      }
      deadLettered++;
      continue;
    }
    // Claim it atomically so two sweepers don't both run it.
    const claimed = await d
      .update(schema.calls)
      .set({ processingStatus: "received", processingStartedAt: sql`now()` })
      .where(and(eq(schema.calls.id, c.id), eq(schema.calls.processingStatus, c.processingStatus)))
      .returning({ id: schema.calls.id });
    if (!claimed.length) continue;
    await processCall(c.id);
    retried++;
  }
  return { retried, deadLettered };
}
