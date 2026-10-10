import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config";
import { KNOWLEDGE_VERSION } from "@/lib/knowledge";
import { listAgents } from "@/lib/vaani/client";
import { getMe } from "@/lib/calendly/client";
import { emailReady } from "@/lib/messaging/send";
import { hubspotConfigured } from "@/lib/hubspot/client";

export type Check = { name: string; ok: boolean | null; detail: string };

const timed = async <T,>(fn: () => Promise<T>): Promise<{ v?: T; err?: string; ms: number }> => {
  const t = Date.now();
  try {
    return { v: await fn(), ms: Date.now() - t };
  } catch (e) {
    return { err: e instanceof Error ? e.message.slice(0, 160) : String(e), ms: Date.now() - t };
  }
};

/** ok:null = not configured yet (shown amber), ok:false = broken (red). */
export async function runHealthChecks(): Promise<Check[]> {
  const out: Check[] = [];

  const neon = await timed(() => db().execute(sql`select 1`));
  out.push({ name: "Neon database", ok: !neon.err, detail: neon.err ?? `reachable (${neon.ms} ms)` });

  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL_SMART;
  if (!key || !model) out.push({ name: "Gemini", ok: null, detail: "GEMINI_API_KEY / GEMINI_MODEL_SMART not set" });
  else {
    const g = await timed(async () => {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });
    out.push({ name: "Gemini", ok: !g.err, detail: g.err ?? `${model} available (${g.ms} ms)` });
  }

  if (!process.env.VAANI_API_KEY) out.push({ name: "Vaani API", ok: null, detail: "VAANI_API_KEY not set" });
  else {
    const v = await timed(() => listAgents());
    const found = v.v?.data.find((a) => a.agent_id === process.env.VAANI_AGENT_ID);
    out.push({ name: "Vaani API + agent", ok: !v.err && Boolean(found), detail: v.err ?? (found ? `agent ${found.agent_display_name} found (${v.ms} ms)` : "key works but VAANI_AGENT_ID not found") });
  }

  const pushed = await getConfig<{ version: string; pushed_at: string } | null>("vaani_agent_knowledge_version", null);
  out.push({
    name: "Knowledge → agent",
    ok: pushed ? pushed.version === KNOWLEDGE_VERSION : null,
    detail: pushed ? (pushed.version === KNOWLEDGE_VERSION ? `agent runs knowledge ${pushed.version}` : `DRIFT: agent has ${pushed.version}, files are ${KNOWLEDGE_VERSION}`) : "no push recorded yet",
  });

  const last = (await db().execute(sql`select max(received_at) as t from webhook_receipts where source='vaani' and signature_valid and external_id is distinct from 'webhook_test'`)).rows[0] as { t: string | null };
  const hours = Number(await getConfig("no_webhook_alert_hours", 6));
  const lastDate = last?.t ? new Date(last.t) : null;
  const ageH = lastDate ? (Date.now() - lastDate.getTime()) / 3_600_000 : null;
  out.push({
    name: "Vaani webhook",
    ok: lastDate ? true : null,
    detail: lastDate ? `last event ${lastDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (${ageH! < 1 ? `${Math.round(ageH! * 60)} min` : `${Math.round(ageH!)} h`} ago; alert after ${hours} h of silence during business hours)` : "no authenticated event received yet",
  });
  const rejected = (await db().execute(sql`select count(*)::int as n from webhook_receipts where source='vaani' and not signature_valid and received_at > now() - interval '24 hours'`)).rows[0] as { n: number };
  out.push({ name: "Rejected webhooks (24 h)", ok: rejected.n === 0 ? true : null, detail: rejected.n ? `${rejected.n} rejected: check the Vaani endpoint URL token` : "none" });

  if (!process.env.CALENDLY_TOKEN) out.push({ name: "Calendly", ok: null, detail: "CALENDLY_TOKEN not set" });
  else {
    const c = await timed(() => getMe());
    out.push({ name: "Calendly", ok: !c.err, detail: c.err ?? `token OK for ${c.v!.name} (${c.ms} ms)` });
  }

  if (!hubspotConfigured()) out.push({ name: "HubSpot (founder view)", ok: null, detail: "HUBSPOT_TOKEN not set" });
  else {
    const hs = await timed(async () => {
      const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    });
    const unsynced = (await db().execute(sql`select count(*)::int as n from enquiries where hubspot_error is not null`)).rows[0] as { n: number };
    out.push({ name: "HubSpot (founder view)", ok: !hs.err && unsynced.n === 0, detail: hs.err ?? (unsynced.n ? `${unsynced.n} enquiries failed to sync (see hubspot_error)` : `connected (${hs.ms} ms); every enquiry mirrors to a contact, qualified ones to a deal`) });
  }
  const mail = await emailReady();
  out.push({ name: "Email (Resend)", ok: mail.ok, detail: mail.detail });

  const dl = (await db().execute(sql`select count(*)::int as n from dead_letters where resolved_at is null and source <> 'vaani_enrich'`)).rows[0] as { n: number };
  out.push({ name: "Dead letters (unresolved)", ok: dl.n === 0, detail: dl.n ? `${dl.n} failed items need a look (table dead_letters)` : "none" });

  const stuck = (await db().execute(sql`select count(*)::int as n from calls where processing_status in ('received','processing') and transcript_text is not null and received_at < now() - interval '10 minutes'`)).rows[0] as { n: number };
  out.push({ name: "Calls stuck scoring", ok: stuck.n === 0, detail: stuck.n ? `${stuck.n} calls waiting; the sweeper retries them` : "none" });
  return out;
}
