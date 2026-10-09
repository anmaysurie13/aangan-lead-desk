/**
 * Calendly setup (Phase 4).
 *   npm run calendly -- --check          verify CALENDLY_TOKEN, print the token owner + active event types
 *   npm run calendly -- --designers      upsert designers from designers.local.json (git-ignored; see designers.example.json)
 *   npm run calendly -- --webhook        create the signed invitee.created/canceled subscription → APP_BASE_URL/api/webhooks/calendly
 *   npm run calendly -- --slots <event_type_uri>   show the next open slots (sanity check)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import { eq } from "drizzle-orm";
import { availableTimes, createWebhookSubscription, getMe, listEventTypes, listWebhookSubscriptions } from "../src/lib/calendly/client";
import { formatIst } from "../src/lib/booking/booking";

type DesignerSeed = { name: string; calendly_event_type_uri?: string; telegram_chat_id?: string; email?: string; phone?: string; active?: boolean };

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    const me = await getMe();
    console.log(`Token owner: ${me.name} <${me.email}>  tz=${me.timezone}\n  user: ${me.uri}\n  org:  ${me.current_organization}`);
    for (const et of await listEventTypes(me.uri)) console.log(`  • ${et.name} (${et.duration} min) ${et.active ? "" : "[inactive]"}\n    ${et.uri}\n    ${et.scheduling_url}`);
  }
  if (args.includes("--slots")) {
    const uri = args[args.indexOf("--slots") + 1];
    const slots = await availableTimes(uri, 14);
    console.log(`${slots.length} open slots in 14 days; next: ${slots.slice(0, 4).map((s) => formatIst(s.start_time)).join(" | ")}`);
  }
  if (args.includes("--designers")) {
    const { db, schema } = await import("../src/db/client");
    const seeds: DesignerSeed[] = JSON.parse(fs.readFileSync("designers.local.json", "utf8"));
    for (const s of seeds) {
      const values = {
        name: s.name,
        calendlyEventTypeUri: s.calendly_event_type_uri ?? null,
        telegramChatId: s.telegram_chat_id ?? null,
        email: s.email ?? null,
        phone: s.phone ?? null,
        active: s.active ?? true,
      };
      const [found] = await db().select().from(schema.designers).where(eq(schema.designers.name, s.name)).limit(1);
      if (found) await db().update(schema.designers).set(values).where(eq(schema.designers.id, found.id));
      else await db().insert(schema.designers).values(values);
      console.log(`${found ? "updated" : "added"}: ${s.name}${values.calendlyEventTypeUri ? "" : "  (no Calendly event type → not bookable)"}`);
    }
  }
  if (args.includes("--webhook")) {
    const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    const base = process.env.APP_BASE_URL;
    if (!key || !base) throw new Error("CALENDLY_WEBHOOK_SIGNING_KEY and APP_BASE_URL must be set");
    const me = await getMe();
    const url = `${base}/api/webhooks/calendly`;
    const existing = (await listWebhookSubscriptions(me.current_organization, me.uri)).collection.find((w) => w.callback_url === url);
    if (existing) console.log(`Webhook already exists (${existing.state}): ${existing.uri}`);
    else console.log(`Created webhook: ${(await createWebhookSubscription({ url, organization: me.current_organization, user: me.uri, signingKey: key })).resource.uri}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
