import { db, schema } from "@/db/client";
import { scanAgentTurnsForPricing } from "@/lib/guardrail/pricing";

/**
 * Caller-facing SMS/WhatsApp. The provider is not chosen yet (open question). Until one is configured
 * (SMS_PROVIDER + its keys), nothing is sent: the attempt is recorded as an undelivered notification with
 * an explicit error, and the link still reaches the designer brief (Phase 5) so the designer can share it.
 * Every outbound text passes the same pricing guardrail as the voice agent.
 */
export type SendResult = { delivered: boolean; error?: string };

export async function sendToCaller(msg: {
  enquiryId: string;
  to: string;
  kind: "scheduling_link";
  text: string;
}): Promise<SendResult> {
  const d = db();
  const breach = scanAgentTurnsForPricing([{ speaker: "agent", text: msg.text }]);
  const provider = process.env.SMS_PROVIDER;
  let result: SendResult;
  if (breach.length) result = { delivered: false, error: `blocked by pricing guardrail: ${breach[0].match}` };
  else if (!provider) result = { delivered: false, error: "sms_provider_not_configured" };
  else result = { delivered: false, error: `unknown SMS_PROVIDER '${provider}'` };

  await d.insert(schema.notifications).values({
    enquiryId: msg.enquiryId,
    channel: process.env.SMS_CHANNEL === "whatsapp" ? "whatsapp" : "sms",
    kind: msg.kind,
    recipient: msg.to,
    payload: { text: msg.text },
    sentAt: result.delivered ? new Date() : null,
    delivered: result.delivered,
    error: result.error ?? null,
  });
  return result;
}
