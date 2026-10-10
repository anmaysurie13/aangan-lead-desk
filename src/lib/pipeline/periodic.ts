import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config";
import { buildSummary, inr, lakh, parseRange } from "@/lib/metrics";
import { emailConfigured, sendEmail } from "@/lib/messaging/send";
import { sweepStuckCalls } from "./sweep";
import { pollCalendlyBookings } from "@/lib/booking/booking";
import { signedLink } from "@/lib/auth";

/**
 * Everything time-based, in one idempotent function (safe to call often):
 *  - sweep calls stuck mid-scoring; poll Calendly for new bookings (fallback when webhooks are unavailable)
 *  - SLA: unclaimed qualified lead → re-alert the designer after sla_claim_minutes, escalate to Nikhil after sla_escalate_minutes
 *  - silence alert: no authenticated Vaani webhook for no_webhook_alert_hours during office hours (once calls have flowed before)
 *  - 8pm IST daily digest to Nikhil (once per day)
 * Called by the Vercel crons (04:30 and 14:30 UTC) and opportunistically after every Vaani webhook.
 * Vercel's free plan only allows daily crons, so the webhook hook gives minute-level SLA checks while calls are arriving.
 */
export async function runPeriodicTasks(now = new Date()) {
  const sweep = await sweepStuckCalls();
  const calendly = await pollCalendlyBookings().catch((e) => ({ error: e instanceof Error ? e.message.slice(0, 120) : String(e) }));
  if (!emailConfigured()) return { sweep, calendly, email: "not_configured" as const };
  const [sla, silence, digest] = await Promise.all([slaAlerts(now), noWebhookAlert(now), maybeSendDigest(now)]);
  return { sweep, calendly, sla, silence, digest };
}

const nikhilEmail = () => process.env.NIKHIL_EMAIL;
const istHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(d));
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d); // YYYY-MM-DD

async function slaAlerts(now: Date) {
  const claimMin = Number(await getConfig("sla_claim_minutes", 30));
  const escalateMin = Number(await getConfig("sla_escalate_minutes", 60));
  const d = db();
  const rows = (
    await d.execute(sql`
      select e.id, e.caller_name, e.locality, e.brief_sent_at, e.assigned_designer_id, d.name as designer_name, d.email as designer_email,
        exists(select 1 from notifications n where n.enquiry_id = e.id and n.kind = 'sla_realert' and n.delivered) as realerted,
        exists(select 1 from notifications n where n.enquiry_id = e.id and n.kind = 'sla_escalation' and n.delivered) as escalated
      from enquiries e left join designers d on d.id = e.assigned_designer_id
      where e.status in ('QUALIFIED','QUALIFIED_WITH_NOTE') and e.claimed_at is null and e.brief_sent_at is not null
        and e.brief_sent_at < ${new Date(now.getTime() - claimMin * 60_000).toISOString()}::timestamptz
      limit 20`)
  ).rows as { id: string; caller_name: string | null; locality: string | null; brief_sent_at: string; assigned_designer_id: string | null; designer_name: string | null; designer_email: string | null; realerted: boolean; escalated: boolean }[];

  let realerts = 0;
  let escalations = 0;
  for (const r of rows) {
    const ageMin = Math.round((now.getTime() - new Date(r.brief_sent_at).getTime()) / 60_000);
    const who = `${r.caller_name ?? "A caller"} (${r.locality ?? "locality unknown"})`;
    if (!r.realerted && r.designer_email && r.assigned_designer_id) {
      const sent = await sendEmail({
        to: r.designer_email,
        subject: `Reminder: unclaimed lead ${who}, ${ageMin} min`,
        text: `This lead has not been claimed ${ageMin} minutes after the brief was sent.\n\nI'll take it: ${signedLink("claim", { e: r.id, d: r.assigned_designer_id })}`,
        kind: "sla_realert",
        enquiryId: r.id,
        recipientDesignerId: r.assigned_designer_id,
      });
      if (sent.delivered) realerts++;
    }
    const nik = nikhilEmail();
    if (!r.escalated && nik && ageMin >= escalateMin) {
      const sent = await sendEmail({
        to: nik,
        subject: `ESCALATION: unclaimed lead ${who}, ${ageMin} min`,
        text: `${r.designer_name ?? "The assigned designer"} has not claimed this lead after ${ageMin} minutes. Please reassign or call the customer.`,
        kind: "sla_escalation",
        enquiryId: r.id,
      });
      if (sent.delivered) escalations++;
    }
  }
  return { checked: rows.length, realerts, escalations };
}

async function noWebhookAlert(now: Date) {
  const nik = nikhilEmail();
  if (!nik) return "no_recipient";
  const hours = Number(await getConfig("no_webhook_alert_hours", 6));
  const h = istHour(now);
  if (h < 10 || h >= 19) return "outside_office_hours";
  const r = (await db().execute(sql`
    select (select max(received_at) from webhook_receipts where source='vaani' and signature_valid and external_id is distinct from 'webhook_test') as last,
           (select count(*)::int from calls) as calls,
           (select count(*)::int from notifications where kind='no_webhook_alert' and delivered and created_at > now() - interval '24 hours') as recent`)).rows[0] as { last: string | null; calls: number; recent: number };
  if (!r.calls || !r.last || r.recent) return "ok_or_already_alerted";
  const silentH = (now.getTime() - new Date(r.last).getTime()) / 3_600_000;
  if (silentH < hours) return "ok";
  await sendEmail({
    to: nik,
    subject: `No Vaani webhook for ${Math.round(silentH)} hours`,
    text: `The last call event from Vaani arrived ${Math.round(silentH)} hours ago (alert threshold: ${hours} h in office hours). Check the Vaani webhook endpoint and the /health page. Calls may be going unrecorded.`,
    kind: "no_webhook_alert",
  });
  return "alerted";
}

async function maybeSendDigest(now: Date) {
  const nik = nikhilEmail();
  if (!nik) return "no_recipient";
  const cfgHour = Number(await getConfig("digest_hour_ist", 20));
  if (istHour(now) < cfgHour) return "too_early";
  const today = istDay(now);
  const done = (await db().execute(sql`select count(*)::int as n from notifications where kind='daily_digest' and delivered and (created_at at time zone 'Asia/Kolkata')::date = ${today}::date`)).rows[0] as { n: number };
  if (done.n) return "already_sent";

  const range = parseRange({ from: today, to: today });
  const s = await buildSummary(range);
  const base = process.env.APP_BASE_URL ?? "";
  const lines = [
    `Aangan Lead Desk: ${today}`,
    "",
    `Calls answered: ${s.calls.total} (${s.calls.outOfHours} out of hours)`,
    `Outcomes: ${s.outcomes.map(([o, n]) => `${o.toLowerCase().replaceAll("_", " ")} ${n}`).join(", ") || "none"}`,
    `Qualified ${s.funnel.qualified} · booked ${s.funnel.booked} · claimed ${s.funnel.claimed}`,
    `Escalations: ${s.escalations}`,
    `PRICING BREACHES: ${s.calls.breaches}${s.calls.breaches ? "  ← review transcripts" : ""}`,
    "",
    `Unclaimed leads (${s.unclaimed.length}):`,
    ...(s.unclaimed.length ? s.unclaimed.map((e) => `- ${e.caller_name ?? "Unknown"} · ${e.locality ?? "?"} · designer ${e.designer_name ?? "unassigned"}`) : ["- none"]),
    "",
    `Needs your decision (${s.needsReview.length}):`,
    ...(s.needsReview.length ? s.needsReview.map((e) => `- ${e.caller_name ?? "Unknown"} · ${e.locality ?? "?"}`) : ["- none"]),
    "",
    `Today's spend: ${inr(s.costs.totalInr)} · pipeline added ${lakh(s.pipeline.low)}–${lakh(s.pipeline.high)}`,
    "",
    `Dashboard: ${base}/dashboard`,
  ];
  const sent = await sendEmail({ to: nik, subject: `Lead Desk digest ${today}: ${s.calls.total} calls, ${s.funnel.qualified} qualified`, text: lines.join("\n"), kind: "daily_digest" });
  return sent.delivered ? "sent" : `failed: ${sent.error}`;
}
