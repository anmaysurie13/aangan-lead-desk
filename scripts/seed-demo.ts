/**
 * Inserts a handful of clearly fake enquiries (calls use vaani_call_id 'sim-demo-*') so the dashboard can be
 * reviewed with data. Remove with: npm run simulate -- --cleanup
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db, schema } from "../src/db/client";
import { KNOWLEDGE_VERSION } from "../src/lib/knowledge";

const mins = (m: number) => new Date(Date.now() - m * 60_000);
const ok = { status: "pass", evidence_quote: "" };
const demo = [
  { name: "Sheetal Deshpande", loc: "Viman Nagar", bhk: "2BHK", sqft: null, ago: 3000, outcome: "ESCALATED", status: "ESCALATED", intent: "EXISTING_CLIENT", owner: "nikhil", issue: "Designer hasn't replied in five days after three messages and two calls.", summary: "Existing client in Viman Nagar.\nDesigner Aryan has not replied in five days.\nUrgent senior callback requested.", frustr: true, asked: false, hour: 11 },
  { name: "Priya Joshi", loc: "Kothrud", bhk: "3BHK", sqft: 1400, ago: 25, outcome: "QUALIFIED", status: "QUALIFIED", intent: "NEW_ENQUIRY", owner: "system", summary: "3BHK in Kothrud, 1,400 sq ft carpet.\nWants a full redesign by March; referred by a past client.\nQualified; consultation link sent.", frustr: false, asked: false, hour: 10, brief: true },
  { name: "Rohit Kulkarni", loc: "Wakad", bhk: "2BHK", sqft: 950, ago: 400, outcome: "QUALIFIED", status: "BOOKED", intent: "NEW_ENQUIRY", owner: "designer", summary: "2BHK in Wakad, 950 sq ft.\nFull home redesign, moving in November.\nBooked a consultation.", frustr: false, asked: true, hour: 14, booked: true },
  { name: "Ananya Rao", loc: "Baner", bhk: "3BHK", sqft: 1200, ago: 900, outcome: "QUALIFIED_WITH_NOTE", status: "CLAIMED", intent: "NEW_ENQUIRY", owner: "designer", summary: "Parents' flat in Baner, the caller is their son.\nParents decide and will attend.\nWith designer.", frustr: false, asked: false, hour: 21, claimed: true },
  { name: "Suresh Patil", loc: "Nashik", bhk: null, sqft: null, ago: 1500, outcome: "DECLINED", status: "DECLINED", intent: "NEW_ENQUIRY", owner: "system", summary: "Home office in Nashik.\nOutside Pune and PCMC.\nDeclined kindly.", frustr: false, asked: false, hour: 16, failed: "service_area" },
  { name: "Meera Nair", loc: "Aundh", bhk: "coworking pod", sqft: 180, ago: 200, outcome: "NEEDS_REVIEW", status: "NEEDS_REVIEW", intent: "NEW_ENQUIRY", owner: "nikhil", summary: "180 sq ft coworking pod in Aundh.\nNo minimum size defined in the docs.\nNikhil to decide.", frustr: false, asked: false, hour: 2 },
  { name: "Imran Shaikh", loc: "Koregaon Park", bhk: "restaurant", sqft: null, ago: 2200, outcome: "DECLINED", status: "DECLINED", intent: "OUT_OF_SCOPE", owner: "system", summary: "Restaurant interiors in Koregaon Park.\nHospitality is out of scope.\nDeclined kindly.", frustr: false, asked: true, hour: 23 },
];

async function main() {
  const d = db();
  const [designer] = await d.select().from(schema.designers).limit(1);
  for (const [i, x] of demo.entries()) {
    const t = mins(x.ago);
    const [caller] = await d.insert(schema.callers).values({ phone: `+9199999${String(90000 + i)}`, name: x.name }).onConflictDoNothing().returning();
    const callerId = caller?.id;
    const [e] = await d.insert(schema.enquiries).values({
      callerId, channel: "phone", status: x.status as never, intent: x.intent as never, ownerType: x.owner as never,
      callerName: x.name, locality: x.loc, bhk: x.bhk, carpetAreaSqft: x.sqft, issue: x.issue ?? null,
      assignedDesignerId: ["QUALIFIED", "QUALIFIED_WITH_NOTE"].includes(x.outcome) ? designer?.id : null,
      firstCallAt: t, lastCallAt: t, scoredAt: t, briefSentAt: x.brief ? t : null,
      claimedAt: x.claimed ? new Date(t.getTime() + 11 * 60_000) : null, bookedAt: x.booked ? new Date(t.getTime() + 90 * 60_000) : null,
    }).returning();
    const at = new Date(t); at.setHours(x.hour, 0, 0, 0); // spread calls through the day for the hours chart
    const [c] = await d.insert(schema.calls).values({
      vaaniCallId: `sim-demo-${i}`, callerId, enquiryId: e.id, fromNumber: `+9199999${90000 + i}`, ringStartedAt: new Date(at.getTime() - 2000), answeredAt: at, endedAt: new Date(at.getTime() + 240_000),
      durationSec: 240, inHours: x.hour >= 10 && x.hour < 19, knowledgeVersion: KNOWLEDGE_VERSION, processingStatus: "scored", receivedAt: t,
      transcriptText: `AGENT: Namaste, thank you for calling Aangan Studio.\nCALLER: Hi, ${x.asked ? "how much would it cost? " : ""}I'm calling about ${x.bhk ?? "a project"} in ${x.loc}.\nAGENT: Of course. Tell me a little about it.`,
    }).returning();
    const crit = { real_project: ok, service_area: x.failed === "service_area" ? { status: "fail", evidence_quote: `I'm in ${x.loc}` } : ok, timeline: ok, budget: ok, decision_maker: ok };
    await d.insert(schema.qualificationResults).values({
      enquiryId: e.id, callId: c.id, model: "demo", knowledgeVersion: KNOWLEDGE_VERSION, intent: x.intent as never, criteria: crit, outcome: x.outcome as never, score: x.outcome === "DECLINED" ? 20 : 80,
      summary3Lines: x.summary, briefForDesigner: x.summary, openQuestions: [], callerSentiment: "neutral", frustrationFlag: x.frustr, rawJson: { rule_trace: ["demo data"] },
    });
    if (x.booked && designer) await d.insert(schema.bookings).values({ enquiryId: e.id, designerId: designer.id, status: "booked", slotStart: new Date(Date.now() + 2 * 86_400_000), slotEnd: new Date(Date.now() + 2 * 86_400_000 + 2_700_000) });
  }
  console.log(`seeded ${demo.length} demo enquiries (remove: npm run simulate -- --cleanup)`);
  process.exit(0);
}
main();
