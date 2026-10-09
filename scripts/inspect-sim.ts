/** Prints the DB state of simulated calls (vaani_call_id 'sim-%'): calls, enquiries, verdicts, costs, receipts. */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "drizzle-orm";
import { db } from "../src/db/client";

async function main() {
  const q = async (s: string) => (await db().execute(sql.raw(s))).rows;
  console.table(
    await q(`select c.vaani_call_id, c.from_number, c.processing_status as status, c.duration_sec as secs, c.in_hours, c.pricing_breach as breach,
                    c.knowledge_version as kv, left(c.enquiry_id::text, 8) as enquiry
             from calls c where c.vaani_call_id like 'sim-%' order by c.received_at`),
  );
  console.table(
    await q(`select left(e.id::text, 8) as enquiry, e.status, e.intent, e.owner_type as owner, e.caller_name, e.locality, e.bhk, e.carpet_area_sqft as sqft,
                    e.timeline_weeks as wks, e.existing_designer_name as designer, (select count(*) from calls x where x.enquiry_id = e.id) as calls
             from enquiries e where e.id in (select enquiry_id from calls where vaani_call_id like 'sim-%')`),
  );
  console.table(
    await q(`select left(q.enquiry_id::text, 8) as enquiry, q.outcome, q.score, q.model, q.input_tokens as in_tok, q.output_tokens as out_tok, q.attempts
             from qualification_results q where q.call_id in (select id from calls where vaani_call_id like 'sim-%') order by q.created_at`),
  );
  console.table(await q(`select vendor, unit, sum(qty) as qty, sum(total_inr) as inr from cost_events where call_id in (select id from calls where vaani_call_id like 'sim-%') group by 1, 2`));
  console.table(await q(`select signature_valid as valid, duplicate, count(*) from webhook_receipts where external_id like 'sim-%' group by 1, 2`));
  console.table(await q(`select source, left(error, 120) as error from dead_letters where external_id like 'sim-%'`));
}
main().then(() => process.exit(0));
