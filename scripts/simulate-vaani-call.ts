/**
 * Sends the documented Vaani webhook sequence for a fixture transcript, as Vaani would for an inbound call:
 *   call_started → user_picked_up_at → call_ended → call_postprocessing
 * Uses the HMAC signature if VAANI_WEBHOOK_SECRET is set, else ?token=VAANI_WEBHOOK_TOKEN.
 *
 *   npm run simulate -- T01                          → http://localhost:3000
 *   npm run simulate -- T17a T17b --phone +919999900017   (same number twice = merge test)
 *   npm run simulate -- T01 --base https://aangan-lead-desk-hazel.vercel.app
 *   npm run simulate -- --cleanup                    deletes all simulated rows (vaani_call_id 'sim-%')
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";

const args = process.argv.slice(2);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const base = opt("base") ?? "http://localhost:3000";
const phone = opt("phone") ?? "+9199999" + String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const fixtures = args.filter((a, i) => !a.startsWith("--") && !["--base", "--phone"].includes(args[i - 1]));

function toVaaniTranscript(fixture: string): string {
  const lines = fs.readFileSync(path.join(__dirname, "..", "evals", "fixtures", `${fixture}.txt`), "utf8").split(/\r?\n/);
  const turns: string[] = [];
  let t = 10 * 3600;
  for (const l of lines) {
    const m = l.match(/^(Front Desk|Caller):\s*(.*)$/);
    const stamp = () => new Date(t * 1000).toISOString().slice(11, 19);
    if (m) {
      t += 6;
      turns.push(`[${stamp()}] ${m[1] === "Front Desk" ? "AGENT" : "USER"}: ${m[2]}`);
    } else if (turns.length && l.trim()) turns[turns.length - 1] += " " + l.trim();
  }
  return turns.join("\n\n");
}

async function send(payload: object) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url = `${base}/api/webhooks/vaani`;
  if (process.env.VAANI_WEBHOOK_SECRET) {
    // Same format Vaani really sends (observed 2026-10-10): sha256=HMAC-SHA256(secret, rawBody)
    headers["x-webhook-signature"] = "sha256=" + createHmac("sha256", process.env.VAANI_WEBHOOK_SECRET).update(body).digest("hex");
  } else {
    url += `?token=${process.env.VAANI_WEBHOOK_TOKEN}`;
  }
  const r = await fetch(url, { method: "POST", headers, body });
  return `${(payload as { event: string }).event} → ${r.status} ${await r.text()}`;
}

async function cleanup() {
  const { db } = await import("../src/db/client");
  const { sql } = await import("drizzle-orm");
  const d = db();
  const q = (s: string) => d.execute(sql.raw(s));
  // Remove the mirrored HubSpot records of simulated leads too (archive = HubSpot recycle bin).
  if (process.env.HUBSPOT_TOKEN) {
    const { archiveObject } = await import("../src/lib/hubspot/client");
    const hs = await q(`select distinct e.hubspot_contact_id as c, e.hubspot_deal_id as d from enquiries e join calls c on c.enquiry_id = e.id where c.vaani_call_id like 'sim-%'`);
    for (const r of hs.rows as { c: string | null; d: string | null }[]) {
      if (r.d) await archiveObject("deals", r.d).catch(() => undefined);
      if (r.c) await archiveObject("contacts", r.c).catch(() => undefined);
    }
    console.log(`archived ${hs.rows.length} HubSpot test lead(s)`);
  }
  const sim = "(select id from calls where vaani_call_id like 'sim-%')";
  const enqIds = (await q(`select distinct enquiry_id from calls where vaani_call_id like 'sim-%' and enquiry_id is not null`)).rows.map((r) => `'${r.enquiry_id}'`);
  const callerIds = (await q(`select distinct caller_id from calls where vaani_call_id like 'sim-%' and caller_id is not null`)).rows.map((r) => `'${r.caller_id}'`);
  await q(`delete from cost_events where call_id in ${sim}`);
  await q(`delete from qualification_results where call_id in ${sim}`);
  await q(`delete from notifications where call_id in ${sim}`);
  await q(`delete from webhook_receipts where external_id like 'sim-%'`);
  await q(`delete from dead_letters where external_id like 'sim-%'`);
  if (enqIds.length) {
    await q(`delete from bookings where enquiry_id in (${enqIds.join(",")})`);
    await q(`delete from notifications where enquiry_id in (${enqIds.join(",")})`);
    await q(`delete from qualification_results where enquiry_id in (${enqIds.join(",")})`);
  }
  await q(`delete from calls where vaani_call_id like 'sim-%'`);
  if (enqIds.length) await q(`delete from enquiries where id in (${enqIds.join(",")})`);
  if (callerIds.length) await q(`delete from callers where id in (${callerIds.join(",")}) and not exists (select 1 from calls c where c.caller_id = callers.id)`);
  console.log(`cleaned: ${enqIds.length} enquiries, ${callerIds.length} callers`);
}

async function main() {
  if (args.includes("--cleanup")) return cleanup();
  if (!fixtures.length) throw new Error("usage: npm run simulate -- T01 [T17b ...] [--phone +91...] [--base URL] | --cleanup");
  for (const f of fixtures) {
    const id = `sim-${f}-${Date.now()}`;
    console.log(`\n${f} as ${id} from ${phone} → ${base}`);
    console.log(await send({ event: "call_started", room_name: id, status: "active", phone_number: phone }));
    console.log(await send({ event: "user_picked_up_at", room_name: id, status: "active" }));
    const transcript = toVaaniTranscript(f);
    const secs = transcript.split("\n\n").length * 6;
    console.log(await send({ event: "call_ended", room_name: id, call_duration: secs, end_reason: "USER_DISCONNECTED" }));
    const post = {
      event: "call_postprocessing",
      call_id: id,
      timestamp: new Date().toISOString(),
      data: { room_name: id, call_id: id, call_duration: secs * 1000, end_reason: "Call ended", summary: "", entities: null, dispositions: null, recording_url: null, transcript },
    };
    console.log(await send(post));
    if (args.includes("--dup")) {
      // Vaani retries on non-2xx/timeouts; a replay after scoring must be a no-op.
      await new Promise((r) => setTimeout(r, 60_000));
      console.log("replay:", await send(post));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
