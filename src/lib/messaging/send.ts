import { db, schema } from "@/db/client";
import { scanAgentTurnsForPricing } from "@/lib/guardrail/pricing";

/**
 * Outbound email via Resend (https://resend.com/docs/api-reference/emails/send-email):
 *   POST https://api.resend.com/emails   Authorization: Bearer RESEND_API_KEY
 *   { from, to: string[], subject, text, html? }  →  { id }
 * Env: RESEND_API_KEY (a send-only key is enough), EMAIL_FROM (e.g. "Aangan Studio <desk@yourdomain.in>").
 * Until a domain is verified in Resend, EMAIL_FROM falls back to onboarding@resend.dev, and Resend only delivers
 * that sender's mail to the Resend account owner's own address (error recorded per send; see /health).
 * Every send is recorded in notifications (delivered flag + error). Caller-facing text passes the pricing guardrail.
 */
export type SendResult = { delivered: boolean; error?: string; messageId?: string };

export const SANDBOX_FROM = "Aangan Studio <onboarding@resend.dev>";
export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const usingSandboxSender = () => !process.env.EMAIL_FROM || /@resend\.dev>?$/i.test(process.env.EMAIL_FROM);

export async function sendEmail(msg: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: (typeof schema.notificationKindEnum.enumValues)[number];
  enquiryId?: string;
  callId?: string;
  recipientDesignerId?: string;
  callerFacing?: boolean;
}): Promise<SendResult> {
  let result: SendResult;
  const breach = msg.callerFacing ? scanAgentTurnsForPricing([{ speaker: "agent", text: `${msg.subject}\n${msg.text}` }]) : [];
  if (breach.length) result = { delivered: false, error: `blocked by pricing guardrail: ${breach[0].match}` };
  else if (!emailConfigured()) result = { delivered: false, error: "email_not_configured" };
  else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || SANDBOX_FROM, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      result = res.ok ? { delivered: true, messageId: body.id } : { delivered: false, error: `resend ${res.status}: ${body.message ?? body.name ?? "error"}`.slice(0, 500) };
    } catch (e) {
      result = { delivered: false, error: e instanceof Error ? e.message.slice(0, 500) : String(e) };
    }
  }
  await db()
    .insert(schema.notifications)
    .values({
      enquiryId: msg.enquiryId ?? null,
      callId: msg.callId ?? null,
      channel: "email",
      kind: msg.kind,
      recipient: msg.to,
      recipientDesignerId: msg.recipientDesignerId ?? null,
      payload: { subject: msg.subject, text: msg.text },
      externalMessageId: result.messageId ?? null,
      sentAt: result.delivered ? new Date() : null,
      delivered: result.delivered,
      error: result.error ?? null,
    });
  return result;
}

export const isEmail = (s: string | null | undefined): s is string => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** For /health. A send-only key can't be checked without sending, so report configuration + the sandbox caveat. */
export async function emailReady(): Promise<{ ok: boolean | null; detail: string }> {
  if (!emailConfigured()) return { ok: null, detail: "RESEND_API_KEY not set: no email can be sent" };
  if (usingSandboxSender()) {
    return { ok: null, detail: "Resend key set, but the sender is Resend's sandbox (onboarding@resend.dev): it only delivers to the Resend account owner. Verify a domain in Resend and set EMAIL_FROM to email callers and designers." };
  }
  return { ok: true, detail: `Resend key set; sending as ${process.env.EMAIL_FROM}` };
}
