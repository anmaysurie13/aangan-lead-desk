/**
 * Seeds non-price config defaults. Rate cards are inserted as NULL on purpose:
 * Nikhil enters real prices; the system never guesses them.
 * Run: npm run db:seed
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { db, schema } from "./client";

const defaults: { key: string; value: unknown; description: string }[] = [
  {
    key: "min_weeks_runway",
    value: 8,
    description:
      "Minimum weeks from consultation to required completion. qualified.md says 8-10 weeks; services.md says 6 weeks. Default 8 pending Nikhil's decision (see README open questions).",
  },
  { key: "sla_claim_minutes", value: 30, description: "Minutes before an unclaimed hot lead is re-alerted." },
  { key: "sla_escalate_minutes", value: 60, description: "Minutes before an unclaimed hot lead escalates to Nikhil." },
  { key: "merge_window_minutes", value: 30, description: "Calls from the same number within this window merge into one enquiry." },
  { key: "no_webhook_alert_hours", value: 6, description: "Alert if no Vaani webhook arrives for this many hours." },
  { key: "office_hours", value: { tz: "Asia/Kolkata", start: "10:00", end: "19:00" }, description: "Front-desk hours; used for in_hours flag." },
  { key: "avg_project_value_inr", value: { low: 800000, high: 1400000 }, description: "From case brief: avg project value ₹8–14L. Used only for internal pipeline value, never spoken to callers." },
  { key: "baseline_unanswered_48h_pct", value: 48, description: "Check 01 pre-launch baseline (Nikhil's manual pull)." },
  { key: "digest_hour_ist", value: 20, description: "Daily digest send hour (IST)." },
  { key: "rate_card_vaani_per_minute_inr", value: null, description: "ENTER: Vaani per-minute price (INR)." },
  { key: "rate_card_claude", value: null, description: "ENTER: per-model {input_per_mtok_inr, output_per_mtok_inr}." },
  { key: "rate_card_telegram_per_message_inr", value: null, description: "ENTER: Telegram cost per message (INR)." },
  { key: "rate_card_sms_per_message_inr", value: null, description: "ENTER: SMS/WhatsApp cost per message (INR)." },
  { key: "fixed_monthly_inr", value: null, description: "ENTER: {vercel, neon, email} fixed monthly costs (INR)." },
];

async function main() {
  for (const row of defaults) {
    await db()
      .insert(schema.config)
      .values({ key: row.key, value: row.value as never, description: row.description })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${defaults.length} config keys (existing keys untouched).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
