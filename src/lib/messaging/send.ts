import nodemailer, { type Transporter } from "nodemailer";
import { db, schema } from "@/db/client";
import { scanAgentTurnsForPricing } from "@/lib/guardrail/pricing";

/**
 * Outbound email (the only channel: no Telegram/SMS, per Nikhil 2026-10-09).
 * SMTP via nodemailer: works with a Gmail/Google Workspace app password, Outlook, Zoho or any SMTP relay.
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 * Every send is recorded in notifications (delivered flag + error). Caller-facing text passes the pricing guardrail.
 * Not configured → nothing is sent and the row says so explicitly.
 */
export type SendResult = { delivered: boolean; error?: string; messageId?: string };

let transport: Transporter | null = null;
function smtp() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 465),
    secure: Number(SMTP_PORT ?? 465) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

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
  const t = smtp();
  if (breach.length) result = { delivered: false, error: `blocked by pricing guardrail: ${breach[0].match}` };
  else if (!t) result = { delivered: false, error: "email_not_configured" };
  else {
    try {
      const info = await t.sendMail({ from: process.env.EMAIL_FROM ?? process.env.SMTP_USER, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
      result = { delivered: true, messageId: info.messageId };
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

/** For /health: verifies the SMTP login without sending anything. ok:null = not configured. */
export async function smtpReady(): Promise<{ ok: boolean | null; detail: string }> {
  const t = smtp();
  if (!t) return { ok: null, detail: "SMTP_HOST / SMTP_USER / SMTP_PASS not set: no email can be sent" };
  try {
    await t.verify();
    return { ok: true, detail: `SMTP login OK (${process.env.SMTP_USER})` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
}

export const emailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);