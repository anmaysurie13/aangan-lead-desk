import { after, NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { isInOfficeHours } from "@/lib/config";
import { KNOWLEDGE_VERSION } from "@/lib/knowledge";
import { normaliseVaaniTranscript, processCall } from "@/lib/pipeline/process-call";
import { runPeriodicTasks } from "@/lib/pipeline/periodic";
import { findCallInHistory } from "@/lib/vaani/client";
import { eventCallId, isPostProcessing, VaaniEvent, verifyVaaniRequest } from "@/lib/vaani/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // scoring runs after the 200 is sent (Vaani requires a reply in < 5 s)

/**
 * Vaani → us. Every request is logged in webhook_receipts (also feeds /health and the no-webhook alert).
 * - Lifecycle events upsert the call row (caller number from call_started, answer time, duration).
 * - call_postprocessing stores the transcript and schedules scoring with after().
 * - Idempotent: calls.vaani_call_id is unique; an already-scored call is never re-scored.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = verifyVaaniRequest({
    rawBody,
    signature: req.headers.get("x-vaani-signature"),
    timestamp: req.headers.get("x-vaani-timestamp"),
    urlToken: req.nextUrl.searchParams.get("token"),
    secret: process.env.VAANI_WEBHOOK_SECRET || undefined,
    token: process.env.VAANI_WEBHOOK_TOKEN || undefined,
  });

  let event: VaaniEvent | null = null;
  try {
    event = VaaniEvent.parse(JSON.parse(rawBody));
  } catch {
    /* logged below */
  }
  const vaaniCallId = event ? eventCallId(event) : null;
  const d = db();

  if (!auth.ok) {
    await d.insert(schema.webhookReceipts).values({ source: "vaani", externalId: vaaniCallId, signatureValid: false });
    // Debug aid for signature-format mismatches: header NAMES only (never values) + reason.
    await d.insert(schema.deadLetters).values({
      source: "vaani_auth",
      externalId: vaaniCallId,
      payload: {
        headerNames: [...req.headers.keys()],
        event: event?.event ?? null,
        // Signature debugging (2026-10-10): only for non-call events, so no transcripts are ever stored here.
        ...(event?.event === "webhook_test" ? { xWebhook: Object.fromEntries([...req.headers].filter(([k]) => k.startsWith("x-webhook"))), body: rawBody.slice(0, 6000) } : {}),
      },
      error: auth.reason,
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (event?.event === "webhook_test") {
    // Vaani dashboard "Test Connectivity" ping. Logged so /health shows the last contact.
    await d.insert(schema.webhookReceipts).values({ source: "vaani", externalId: "webhook_test", signatureValid: true });
    return NextResponse.json({ status: "ok" });
  }
  if (!event || !vaaniCallId) {
    await d.insert(schema.webhookReceipts).values({ source: "vaani", externalId: null, signatureValid: true });
    await d.insert(schema.deadLetters).values({ source: "vaani_webhook", payload: safeJson(rawBody), error: "unparseable payload" });
    return NextResponse.json({ status: "ignored" }, { status: 200 }); // 2xx so Vaani doesn't retry garbage
  }

  const [existing] = await d.select().from(schema.calls).where(eq(schema.calls.vaaniCallId, vaaniCallId)).limit(1);
  const duplicate = isPostProcessing(event) && existing?.processingStatus === "scored";
  await d.insert(schema.webhookReceipts).values({ source: "vaani", externalId: vaaniCallId, signatureValid: true, duplicate });
  if (duplicate) return NextResponse.json({ status: "duplicate" });

  const now = new Date();
  const patch: Partial<typeof schema.calls.$inferInsert> = {};
  const e = event as Record<string, unknown>;
  switch (event.event) {
    case "call_started":
      if (typeof e.phone_number === "string") patch.fromNumber = e.phone_number;
      patch.ringStartedAt = now;
      break;
    case "user_picked_up_at":
      patch.answeredAt = now;
      break;
    case "call_ended":
      patch.endedAt = now;
      if (typeof e.call_duration === "number") patch.durationSec = Math.round(e.call_duration);
      break;
  }
  if (isPostProcessing(event)) {
    const data = event.data;
    patch.rawTranscript = event as unknown as Record<string, unknown>;
    patch.transcriptText = data.transcript ? normaliseVaaniTranscript(data.transcript) : null;
    patch.recordingUrl = data.recording_url ?? null;
    if (typeof data.call_duration === "number") patch.durationSec = Math.round(data.call_duration / 1000);
    patch.endedAt = existing?.endedAt ?? (event.timestamp ? new Date(event.timestamp) : now);
    // With "Send all call details" enabled, Vaani may include call-record fields. Read only the names
    // documented for call records (api-reference/call-history); ignore anything else.
    const rec = data as Record<string, unknown>;
    const inbound = /inbound|incoming/i.test(String(rec.direction ?? rec.call_type ?? "inbound"));
    const caller = inbound ? rec.from_number : rec.to_number;
    if (!existing?.fromNumber && typeof caller === "string") patch.fromNumber = caller;
    if (!existing?.answeredAt && typeof rec.user_picked_up_at === "string") patch.answeredAt = new Date(rec.user_picked_up_at);
    if (typeof rec.End_time === "string") patch.endedAt = new Date(rec.End_time);
  }

  const [row] = await d
    .insert(schema.calls)
    .values({
      vaaniCallId,
      knowledgeVersion: KNOWLEDGE_VERSION,
      inHours: await isInOfficeHours(existing?.answeredAt ?? now),
      ...patch,
    })
    .onConflictDoUpdate({ target: schema.calls.vaaniCallId, set: patch })
    .returning({ id: schema.calls.id });

  const isTranscript = isPostProcessing(event);
  after(async () => {
    if (isTranscript) {
      await enrichFromHistory(row.id, vaaniCallId);
      await processCall(row.id);
    }
    await runPeriodicTasks().catch(() => undefined); // sweep stuck calls, SLA re-alerts, silence alert, digest (idempotent)
  });
  return NextResponse.json({ status: "ok" });
}

/** Best effort: caller number, timestamps and Vaani's own call_cost from call-history. Never blocks scoring. */
async function enrichFromHistory(callRowId: string, vaaniCallId: string) {
  try {
    const rec = await findCallInHistory(vaaniCallId);
    if (!rec) return;
    const d = db();
    const [cur] = await d.select().from(schema.calls).where(eq(schema.calls.id, callRowId)).limit(1);
    const isInbound = /inbound|incoming/i.test(rec.direction ?? rec.call_type ?? "");
    await d
      .update(schema.calls)
      .set({
        fromNumber: cur?.fromNumber ?? (isInbound ? rec.from_number : rec.to_number) ?? null,
        answeredAt: cur?.answeredAt ?? (rec.user_picked_up_at ? new Date(rec.user_picked_up_at) : rec.Start_time ? new Date(rec.Start_time) : null),
        ringStartedAt: cur?.ringStartedAt ?? (rec.call_ringing_at ? new Date(rec.call_ringing_at) : null),
        endedAt: rec.End_time ? new Date(rec.End_time) : cur?.endedAt,
      })
      .where(eq(schema.calls.id, callRowId));
    const already = await d.select({ id: schema.costEvents.id }).from(schema.costEvents).where(and(eq(schema.costEvents.callId, callRowId), eq(schema.costEvents.vendor, "vaani"))).limit(1);
    if (typeof rec.call_cost === "number" && !already.length) {
      // call_cost is reported by Vaani "in credits"; the wallet is INR-denominated (confirm 1 credit = ₹1 in README).
      await d.insert(schema.costEvents).values({
        callId: callRowId,
        vendor: "vaani",
        unit: "call",
        qty: "1",
        unitCostInr: String(rec.call_cost),
        totalInr: String(rec.call_cost),
      });
    }
  } catch (err) {
    await db()
      .insert(schema.deadLetters)
      .values({ source: "vaani_enrich", externalId: vaaniCallId, error: err instanceof Error ? err.message.slice(0, 2000) : String(err) });
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s.slice(0, 5000) };
  }
}
