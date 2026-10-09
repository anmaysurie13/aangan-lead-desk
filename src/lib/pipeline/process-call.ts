import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { getConfig } from "@/lib/config";
import { scoreCall, ScorerError } from "@/lib/scorer/score";
import { parseTranscript } from "@/lib/transcript";
import type { Verdict } from "@/lib/scorer/schema";

/**
 * Post-call pipeline for ONE call row (already stored by the webhook). Steps:
 *  1. merge: same caller within merge_window_minutes → same enquiry (dropped-call case)
 *  2. score all transcripts of that enquiry together
 *  3. store qualification_result, update enquiry (fields, status, owner, timestamps), flag pricing breach
 *  4. cost events (Gemini tokens; Vaani call cost when known)
 * Idempotent: a call already scored is skipped. Failures → dead_letters + enquiry NEEDS_REVIEW (owner Nikhil).
 * Notifications (Telegram/email) are wired in Phase 5 via routeOutcome().
 */
export async function processCall(callRowId: string): Promise<{ status: string; enquiryId?: string; outcome?: string }> {
  const d = db();
  const [call] = await d.select().from(schema.calls).where(eq(schema.calls.id, callRowId)).limit(1);
  if (!call) return { status: "missing" };
  if (call.processingStatus === "scored") return { status: "already_scored", enquiryId: call.enquiryId ?? undefined };
  if (!call.transcriptText?.trim()) {
    await d.update(schema.calls).set({ processingStatus: "no_transcript" }).where(eq(schema.calls.id, call.id));
    return { status: "no_transcript" };
  }
  await d
    .update(schema.calls)
    .set({ processingStatus: "processing", processingStartedAt: new Date(), processingAttempts: call.processingAttempts + 1 })
    .where(eq(schema.calls.id, call.id));

  // ---- 1. caller + merge ----
  let callerId = call.callerId;
  if (!callerId && call.fromNumber) {
    const [c] = await d
      .insert(schema.callers)
      .values({ phone: call.fromNumber })
      .onConflictDoUpdate({ target: schema.callers.phone, set: { lastSeenAt: new Date() } })
      .returning({ id: schema.callers.id });
    callerId = c.id;
  }

  const endedAt = call.endedAt ?? call.receivedAt;
  let enquiryId = call.enquiryId;
  if (!enquiryId && callerId) {
    const windowMin = await getConfig("merge_window_minutes", 30);
    const since = new Date(endedAt.getTime() - windowMin * 60_000);
    const [recent] = await d
      .select({ enquiryId: schema.calls.enquiryId })
      .from(schema.calls)
      .where(and(eq(schema.calls.callerId, callerId), ne(schema.calls.id, call.id), gte(schema.calls.receivedAt, since)))
      .orderBy(desc(schema.calls.receivedAt))
      .limit(1);
    enquiryId = recent?.enquiryId ?? null;
  }
  if (!enquiryId) {
    const [e] = await d
      .insert(schema.enquiries)
      .values({ callerId, channel: "phone", firstCallAt: call.answeredAt ?? call.receivedAt, ownerType: "system" })
      .returning({ id: schema.enquiries.id });
    enquiryId = e.id;
  }
  await d.update(schema.calls).set({ callerId, enquiryId }).where(eq(schema.calls.id, call.id));

  // ---- 2. score every transcript in this enquiry, oldest first ----
  const siblings = await d
    .select({ id: schema.calls.id, transcriptText: schema.calls.transcriptText, receivedAt: schema.calls.receivedAt })
    .from(schema.calls)
    .where(eq(schema.calls.enquiryId, enquiryId))
    .orderBy(schema.calls.receivedAt);
  const transcripts = siblings.map((s) => s.transcriptText ?? "").filter((t) => t.trim());

  try {
    const minWeeksRunway = await getConfig("min_weeks_runway", 8);
    const result = await scoreCall({ transcripts, config: { minWeeksRunway, languages: ["English", "Hindi"] }, nowIso: endedAt.toISOString() });
    const v = result.verdict;

    // ---- 3. persist ----
    await d.insert(schema.qualificationResults).values({
      enquiryId,
      callId: call.id,
      model: result.modelVersion ?? result.model,
      knowledgeVersion: result.knowledgeVersion,
      intent: v.intent,
      criteria: v.criteria,
      outcome: v.outcome,
      score: v.score_0_100,
      summary3Lines: v.summary_3_lines,
      briefForDesigner: v.brief_for_designer,
      openQuestions: v.open_questions,
      callerSentiment: v.caller_sentiment,
      frustrationFlag: v.frustration_flag,
      rawJson: { ...v, pricing_hits: result.pricingHits },
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens + result.usage.thinkingTokens,
      attempts: result.attempts,
    });

    const cap = v.captured;
    const now = new Date();
    await d
      .update(schema.enquiries)
      .set({
        status: v.outcome,
        intent: v.intent,
        declineReason: v.outcome === "DECLINED" ? cap.decline_reason ?? v.rule_trace.join("; ") : null,
        ...ownerFor(v.outcome),
        callerName: cap.caller_name,
        locality: cap.locality,
        propertyType: cap.property_type,
        bhk: cap.bhk,
        carpetAreaSqft: cap.carpet_area_sqft,
        scope: cap.scope_rooms,
        currentState: cap.current_state,
        timelineText: cap.timeline_text,
        timelineWeeks: cap.timeline_weeks,
        ownership: cap.ownership,
        decisionMakerStatus: cap.decision_maker_status,
        referralSource: cap.referral_source,
        language: cap.language,
        siteVisitRequested: cap.site_visit_requested,
        existingDesignerName: cap.existing_designer_name,
        projectLocation: cap.project_location,
        issue: cap.issue,
        lastCallAt: endedAt,
        scoredAt: now,
        updatedAt: now,
      })
      .where(eq(schema.enquiries.id, enquiryId));

    await d
      .update(schema.calls)
      .set({
        processingStatus: "scored",
        pricingBreach: result.pricingBreach,
        pricingBreachHits: result.pricingHits.length ? result.pricingHits : null,
        knowledgeVersion: result.knowledgeVersion,
      })
      .where(inArray(schema.calls.id, siblings.map((s) => s.id)));

    // ---- 4. costs ----
    await recordGeminiCost(call.id, result.usage);

    await routeOutcome({ enquiryId, callId: call.id, verdict: v, pricingBreach: result.pricingBreach });
    return { status: "scored", enquiryId, outcome: v.outcome };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await d.insert(schema.deadLetters).values({
      source: "scorer",
      externalId: call.vaaniCallId,
      payload: { callRowId: call.id, enquiryId, attempts: e instanceof ScorerError ? e.attempts : undefined },
      error: msg.slice(0, 4000),
    });
    await d.update(schema.calls).set({ processingStatus: "failed" }).where(eq(schema.calls.id, call.id));
    await d
      .update(schema.enquiries)
      .set({ status: "NEEDS_REVIEW", ownerType: "nikhil", updatedAt: new Date() })
      .where(eq(schema.enquiries.id, enquiryId));
    return { status: "failed", enquiryId };
  }
}

/** Check 09: every enquiry has an owner. Designers take ownership by claiming in Telegram (Phase 5). */
function ownerFor(outcome: Verdict["outcome"]): { ownerType: "designer" | "nikhil" | "system" } {
  switch (outcome) {
    case "ESCALATED":
    case "NEEDS_REVIEW":
      return { ownerType: "nikhil" };
    default:
      return { ownerType: "system" }; // QUALIFIED*: system routes to a designer; DECLINED: closed by system
  }
}

async function recordGeminiCost(callId: string, usage: { inputTokens: number; outputTokens: number; thinkingTokens: number }) {
  // Rate card entered by Nikhil in config.rate_card_gemini as {input_per_mtok_inr, output_per_mtok_inr}. Never guessed:
  // if unset, quantities are still stored (unit cost 0) so spend can be recomputed once the rate is entered.
  const card = await getConfig<{ input_per_mtok_inr: number; output_per_mtok_inr: number } | null>("rate_card_gemini", null);
  const out = usage.outputTokens + usage.thinkingTokens;
  const rows = [
    { unit: "input_token", qty: usage.inputTokens, rate: card ? card.input_per_mtok_inr / 1e6 : 0 },
    { unit: "output_token", qty: out, rate: card ? card.output_per_mtok_inr / 1e6 : 0 },
  ];
  await db()
    .insert(schema.costEvents)
    .values(
      rows.map((r) => ({
        callId,
        vendor: "gemini",
        unit: r.unit,
        qty: String(r.qty),
        unitCostInr: String(r.rate),
        totalInr: String(r.qty * r.rate),
      })),
    );
}

/** Phase 5 hook: Telegram brief / urgent alert / breach alert / digest. Until then, nothing is sent. */
async function routeOutcome(input: { enquiryId: string; callId: string; verdict: Verdict; pricingBreach: boolean }) {
  void input;
}

/** Normalises Vaani's "[hh:mm:ss] AGENT: ...\n\n[..] USER: ..." transcript into our "AGENT:/CALLER:" lines. */
export function normaliseVaaniTranscript(raw: string): string {
  return parseTranscript(raw)
    .map((t) => `${t.speaker === "agent" ? "AGENT" : "CALLER"}: ${t.text}`)
    .join("\n");
}

